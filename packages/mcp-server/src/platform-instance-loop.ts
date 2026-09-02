import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createFigmaPlatformInstancePlan,
  createSuccessResult,
  createToolkitError,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
  writerPlatformInstanceResultSchema,
  type DesignSystemSnapshot,
  type FigmaPlatformInstancePlan,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import type {
  ExecuteWriterCommandOptions,
  LocalWriterClient,
  WriterOperation,
} from "./local-writer-client.js";

const variantSelectionsSchema = z
  .record(stableIdSegmentSchema, stableIdSegmentSchema)
  .refine((value) => Object.keys(value).length <= 32, {
    message: "Must contain at most 32 Variant selections.",
  });

export const platformInstanceLoopInputSchema = z.strictObject({
  assetId: stableAssetIdSchema.describe("Exact Component asset ID."),
  assetVersion: strictSemverSchema.optional(),
  fileBindingId: z.uuid().describe("Exact target Figma page file binding."),
  instanceId: stableAssetIdSchema.describe(
    "Stable page-local Instance ID. Reuse only for an exact retry.",
  ),
  platformTargetId: stableAssetIdSchema,
  platformTargetVersion: strictSemverSchema,
  propertyValues: z
    .record(stableAssetIdSchema, z.string().min(1).max(1_000))
    .default({}),
  requestId: z.uuid(),
  variantSelections: variantSelectionsSchema,
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export type PlatformInstanceLoopInput = z.infer<
  typeof platformInstanceLoopInputSchema
>;

const platformInstanceLoopOutputDataSchema = z.strictObject({
  audit: z.strictObject({
    approval: z.literal("verified-by-bridge"),
    detached: z.literal(false),
    remoteSource: z.literal("audited-by-plugin"),
    registry: z.literal("official-ready"),
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
    bindingId: stableAssetIdSchema,
    bindingVersion: strictSemverSchema,
    componentKey: z.string(),
    fileBindingId: z.uuid(),
    platformTargetId: stableAssetIdSchema,
    platformTargetVersion: strictSemverSchema,
    selectedVariantId: stableAssetIdSchema,
  }),
  status: z.literal("inserted"),
});

export const platformInstanceLoopOutputSchema = z.strictObject({
  data: platformInstanceLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

export type PlatformInstanceLoopOutput = z.infer<
  typeof platformInstanceLoopOutputDataSchema
>;

export interface PlatformInstanceLoopOptions {
  readonly expectedProjectId: string;
  readonly writer: LocalWriterClient;
}

function commandFromPlan(
  request: PlatformInstanceLoopInput,
  plan: FigmaPlatformInstancePlan,
): WriterCommandEnvelope {
  return {
    approval: {
      approvalId: plan.source.approvalId,
      mode: "approved",
      subject: {
        assetId: plan.source.bindingId,
        assetVersion: plan.source.bindingVersion,
        contentDigest: plan.source.contentDigest,
        projectId: plan.source.projectId,
        type: "platform-binding",
      },
    },
    command: {
      payload: { plan },
      type: "instances.platform.insert",
    },
    idempotencyKey: `platform-instance:${request.requestId}`,
    operationId: request.requestId,
    projectId: plan.source.projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" },
    target: {
      fileBindingId: plan.source.fileBindingId,
      kind: "figma-file",
      stableId: `${plan.source.projectId}/figma-file/page`,
    },
  };
}

export async function runPlatformInstanceLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: PlatformInstanceLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<PlatformInstanceLoopOutput>> {
  const request = platformInstanceLoopInputSchema.safeParse(input);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The official Platform Instance request is invalid.",
        recoveryInstruction:
          "Provide exact platform and component identities, a stable request and Instance ID, approved property values, file binding, and finite coordinates.",
        target: { logicalId: "platform-instance-loop", type: "operation" },
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
  const planned = createFigmaPlatformInstancePlan(snapshot, {
    assetId: request.data.assetId,
    assetVersion: request.data.assetVersion,
    fileBindingId: request.data.fileBindingId,
    instanceId: request.data.instanceId,
    platformTargetId: request.data.platformTargetId,
    platformTargetVersion: request.data.platformTargetVersion,
    projectId: options.expectedProjectId,
    propertyValues: request.data.propertyValues,
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
  const result = writerPlatformInstanceResultSchema.safeParse(operation.result);
  if (
    operation.status !== "succeeded" ||
    !result.success ||
    result.data.component.key !== planned.data.source.componentKey ||
    result.data.instance.stableId !== planned.data.instance.stableId ||
    result.data.instance.detached
  ) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message:
          "The completed Writer Operation did not contain an audited official remote Instance result.",
        recoveryInstruction:
          "Inspect the Operation Log, Plugin version, Library access and Component Key before retrying.",
        target: { logicalId: operation.operationId, type: "operation" },
      }),
    );
  }
  return createSuccessResult({
    audit: {
      approval: "verified-by-bridge",
      detached: false,
      remoteSource: "audited-by-plugin",
      registry: "official-ready",
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
      bindingId: planned.data.source.bindingId,
      bindingVersion: planned.data.source.bindingVersion,
      componentKey: planned.data.source.componentKey,
      fileBindingId: planned.data.source.fileBindingId,
      platformTargetId: planned.data.source.platformTargetId,
      platformTargetVersion: planned.data.source.platformTargetVersion,
      selectedVariantId: planned.data.selectedVariantId,
    },
    status: "inserted",
  });
}
