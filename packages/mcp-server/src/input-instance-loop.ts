import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createFigmaInputInstancePlan,
  createSuccessResult,
  createToolkitError,
  stableAssetIdSchema,
  strictSemverSchema,
  writerInputInstanceResultSchema,
  type DesignSystemSnapshot,
  type FigmaInputInstancePlan,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import type {
  ExecuteWriterCommandOptions,
  LocalWriterClient,
  WriterOperation,
} from "./local-writer-client.js";

const inputSelectionsSchema = z
  .object({
    content: z.enum(["empty", "filled"]),
    state: z.enum(["default", "focused", "error", "disabled"]),
  })
  .strict();

const visibleTextSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value, {
    message: "Text must not start or end with whitespace.",
  });

export const inputInstanceLoopInputSchema = z.strictObject({
  assetId: stableAssetIdSchema.describe("Exact registered Input asset ID."),
  assetVersion: strictSemverSchema
    .optional()
    .describe("Optional exact active Input SemVer."),
  instanceId: stableAssetIdSchema.describe(
    "Stable page-local Instance ID. Reuse only for an exact retry.",
  ),
  label: visibleTextSchema.describe("Visible Input label."),
  requestId: z
    .uuid()
    .describe("Stable UUID for this insertion intent and exact retries."),
  supportingText: visibleTextSchema.describe(
    "Visible help or error message below the field.",
  ),
  text: visibleTextSchema.describe("Visible field value or placeholder."),
  variantSelections: inputSelectionsSchema.describe(
    "Exact Input State and Content selection.",
  ),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export type InputInstanceLoopInput = z.infer<
  typeof inputInstanceLoopInputSchema
>;

const inputInstanceLoopOutputDataSchema = z.strictObject({
  audit: z.strictObject({
    approval: z.literal("verified-by-bridge"),
    component: z.literal("audited-by-plugin"),
    registry: z.literal("ready"),
  }),
  operation: z.strictObject({
    action: z.enum(["created", "recovered", "unchanged"]),
    attempt: z.number().int().positive(),
    instanceNodeId: z.string().regex(/^\d+:\d+$/u),
    operationId: z.uuid(),
    status: z.literal("succeeded"),
  }),
  resolution: z.strictObject({
    approvalId: z.string(),
    assetId: stableAssetIdSchema,
    assetVersion: strictSemverSchema,
    componentSetNodeId: z.string().regex(/^\d+:\d+$/u),
    fileBindingId: z.uuid(),
    selectedVariantId: stableAssetIdSchema,
    variantSelections: inputSelectionsSchema,
  }),
  status: z.literal("inserted"),
});

export const inputInstanceLoopOutputSchema = z.strictObject({
  data: inputInstanceLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

export type InputInstanceLoopOutput = z.infer<
  typeof inputInstanceLoopOutputDataSchema
>;

export interface InputInstanceLoopOptions {
  readonly expectedProjectId: string;
  readonly writer: LocalWriterClient;
}

function commandFromPlan(
  request: InputInstanceLoopInput,
  plan: FigmaInputInstancePlan,
): WriterCommandEnvelope {
  return {
    approval: {
      approvalId: plan.source.approvalId,
      mode: "approved",
      subject: {
        assetId: plan.source.assetId,
        assetVersion: plan.source.assetVersion,
        contentDigest: plan.source.contentDigest,
        projectId: plan.source.projectId,
        type: "component",
      },
    },
    command: { payload: { plan }, type: "instances.input.insert" },
    idempotencyKey: `input-instance:${request.requestId}`,
    operationId: request.requestId,
    projectId: plan.source.projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" },
    target: {
      fileBindingId: plan.source.fileBindingId,
      kind: "figma-file",
      stableId: `${plan.source.projectId}/figma-file/library`,
    },
  };
}

export async function runInputInstanceLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: InputInstanceLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<InputInstanceLoopOutput>> {
  const request = inputInstanceLoopInputSchema.safeParse(input);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The Input page insertion request is invalid.",
        recoveryInstruction:
          "Provide stable request and Instance IDs, exact State and Content, bounded visible text, and finite coordinates.",
        target: { logicalId: "input-instance-loop", type: "operation" },
      }),
    );
  }
  if (snapshot.projectId !== options.expectedProjectId) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_CONFLICT",
        message:
          "The loaded design system does not match the configured project.",
        recoveryInstruction:
          "Reload the configured project before requesting a Figma write.",
        target: { logicalId: snapshot.projectId, type: "project" },
      }),
    );
  }
  const planned = createFigmaInputInstancePlan(snapshot, {
    assetId: request.data.assetId,
    ...(request.data.assetVersion === undefined
      ? {}
      : { assetVersion: request.data.assetVersion }),
    instanceId: request.data.instanceId,
    label: request.data.label,
    projectId: options.expectedProjectId,
    supportingText: request.data.supportingText,
    text: request.data.text,
    variantSelections: request.data.variantSelections,
    x: request.data.x,
    y: request.data.y,
  });
  if (!planned.ok) return planned;
  const operationResult = await options.writer.execute(
    commandFromPlan(request.data, planned.data),
    executeOptions,
  );
  if (!operationResult.ok) return operationResult;
  const operation: WriterOperation = operationResult.data;
  const result = writerInputInstanceResultSchema.safeParse(operation.result);
  if (
    operation.status !== "succeeded" ||
    !result.success ||
    result.data.componentSet.stableId !== planned.data.componentSet.stableId ||
    result.data.instance.stableId !== planned.data.instance.stableId ||
    result.data.variant.stableId !== planned.data.selectedVariant.stableId
  ) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message:
          "The completed Writer Operation did not contain an audited Input Instance result.",
        recoveryInstruction:
          "Inspect the local Operation Log and Plugin version before retrying.",
        target: { logicalId: operation.operationId, type: "operation" },
      }),
    );
  }
  return createSuccessResult({
    audit: {
      approval: "verified-by-bridge",
      component: "audited-by-plugin",
      registry: "ready",
    },
    operation: {
      action: result.data.instance.action,
      attempt: operation.attempt,
      instanceNodeId: result.data.instance.nodeId,
      operationId: operation.operationId,
      status: "succeeded",
    },
    resolution: {
      approvalId: planned.data.source.approvalId,
      assetId: planned.data.source.assetId,
      assetVersion: planned.data.source.assetVersion,
      componentSetNodeId: result.data.componentSet.nodeId,
      fileBindingId: planned.data.source.fileBindingId,
      selectedVariantId: planned.data.selectedVariant.stableId,
      variantSelections: planned.data.selectedVariant.selections,
    },
    status: "inserted",
  });
}
