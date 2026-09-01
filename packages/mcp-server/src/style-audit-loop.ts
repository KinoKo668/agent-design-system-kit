import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createFigmaStyleAuditPlan,
  createSuccessResult,
  createToolkitError,
  figmaStyleAuditResultSchema,
  type DesignSystemSnapshot,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import type {
  ExecuteWriterCommandOptions,
  LocalWriterClient,
} from "./local-writer-client.js";

export const styleAuditLoopInputSchema = z.strictObject({
  requestId: z
    .uuid()
    .describe(
      "Stable UUID for this audit snapshot. Reuse only to recover the same run; use a new UUID to rescan changed Figma state.",
    ),
});

const styleAuditLoopOutputDataSchema = z.strictObject({
  audit: figmaStyleAuditResultSchema,
  operation: z.strictObject({
    attempt: z.number().int().positive(),
    operationId: z.uuid(),
    status: z.literal("succeeded"),
  }),
  status: z.enum(["passed", "violations-found"]),
});

export const styleAuditLoopOutputSchema = z.strictObject({
  data: styleAuditLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

export type StyleAuditLoopOutput = z.infer<
  typeof styleAuditLoopOutputDataSchema
>;

export interface StyleAuditLoopOptions {
  readonly expectedProjectId: string;
  readonly writer: LocalWriterClient;
}

export async function runStyleAuditLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: StyleAuditLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<StyleAuditLoopOutput>> {
  const request = styleAuditLoopInputSchema.safeParse(input);
  if (!request.success || snapshot.projectId !== options.expectedProjectId) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The current-page style audit request is invalid.",
        recoveryInstruction:
          "Provide a new stable request UUID for the configured project.",
        target: { logicalId: "style-audit", type: "operation" },
      }),
    );
  }
  const planned = createFigmaStyleAuditPlan(snapshot);
  if (!planned.ok) return planned;
  const command: WriterCommandEnvelope = {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
    command: {
      payload: { plan: planned.data },
      type: "audit.styles.scan",
    },
    idempotencyKey: `style-audit:${request.data.requestId}`,
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
  const audit = figmaStyleAuditResultSchema.safeParse(executed.data.result);
  if (executed.data.status !== "succeeded" || !audit.success) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message:
          "The completed read-only operation did not contain a valid style audit report.",
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
