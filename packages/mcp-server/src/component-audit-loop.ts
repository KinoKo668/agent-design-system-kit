import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createFigmaComponentAuditPlan,
  createSuccessResult,
  createToolkitError,
  figmaComponentAuditResultSchema,
  type DesignSystemSnapshot,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import type {
  ExecuteWriterCommandOptions,
  LocalWriterClient,
} from "./local-writer-client.js";

export const componentAuditLoopInputSchema = z.strictObject({
  requestId: z
    .uuid()
    .describe(
      "Stable UUID for this audit snapshot. Reuse only to recover the same run; use a new UUID to rescan changed Figma state.",
    ),
});

const componentAuditLoopOutputDataSchema = z.strictObject({
  audit: figmaComponentAuditResultSchema,
  operation: z.strictObject({
    attempt: z.number().int().positive(),
    operationId: z.uuid(),
    status: z.literal("succeeded"),
  }),
  status: z.enum(["passed", "violations-found"]),
});

export const componentAuditLoopOutputSchema = z.strictObject({
  data: componentAuditLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

export type ComponentAuditLoopOutput = z.infer<
  typeof componentAuditLoopOutputDataSchema
>;

export interface ComponentAuditLoopOptions {
  readonly expectedProjectId: string;
  readonly writer: LocalWriterClient;
}

export async function runComponentAuditLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: ComponentAuditLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<ComponentAuditLoopOutput>> {
  const request = componentAuditLoopInputSchema.safeParse(input);
  if (!request.success || snapshot.projectId !== options.expectedProjectId) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The current-page component audit request is invalid.",
        recoveryInstruction:
          "Provide a new stable request UUID for the configured project.",
        target: { logicalId: "component-audit", type: "operation" },
      }),
    );
  }
  const planned = createFigmaComponentAuditPlan(snapshot);
  if (!planned.ok) return planned;
  const command: WriterCommandEnvelope = {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    command: {
      payload: { plan: planned.data },
      type: "audit.components.scan",
    },
    idempotencyKey: `component-audit:${request.data.requestId}`,
    operationId: request.data.requestId,
    projectId: snapshot.projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" },
    target: {
      fileBindingId: planned.data.fileBindingId,
      kind: "figma-file",
      stableId: `${snapshot.projectId}/figma-file/library`,
    },
  };
  const executed = await options.writer.execute(command, executeOptions);
  if (!executed.ok) return executed;
  const audit = figmaComponentAuditResultSchema.safeParse(executed.data.result);
  if (executed.data.status !== "succeeded" || !audit.success) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message:
          "The completed read-only operation did not contain a valid component audit report.",
        recoveryInstruction:
          "Update the local Bridge and Figma Plugin to matching versions, then run a new audit request.",
        target: {
          logicalId: executed.data.operationId,
          type: "operation",
        },
      }),
    );
  }
  return createSuccessResult({
    audit: audit.data,
    operation: {
      attempt: executed.data.attempt,
      operationId: executed.data.operationId,
      status: "succeeded",
    },
    status: audit.data.passed ? "passed" : "violations-found",
  });
}
