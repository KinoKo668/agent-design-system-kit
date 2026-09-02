import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createFigmaPlatformAuditPlan,
  createSuccessResult,
  createToolkitError,
  figmaPlatformAuditResultSchema,
  type DesignSystemSnapshot,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import type {
  ExecuteWriterCommandOptions,
  LocalWriterClient,
} from "./local-writer-client.js";

export const platformAuditLoopInputSchema = z.strictObject({
  fileBindingId: z.uuid().describe("Exact current Figma page file binding."),
  requestId: z
    .uuid()
    .describe(
      "Stable UUID for this audit snapshot; use a new one after changes.",
    ),
});

const platformAuditLoopOutputDataSchema = z.strictObject({
  audit: figmaPlatformAuditResultSchema,
  operation: z.strictObject({
    attempt: z.number().int().positive(),
    operationId: z.uuid(),
    status: z.literal("succeeded"),
  }),
  status: z.enum(["passed", "violations-found"]),
});

export const platformAuditLoopOutputSchema = z.strictObject({
  data: platformAuditLoopOutputDataSchema,
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

export interface PlatformAuditLoopOptions {
  readonly expectedProjectId: string;
  readonly writer: LocalWriterClient;
}

export async function runPlatformAuditLoop(
  snapshot: DesignSystemSnapshot,
  input: unknown,
  options: PlatformAuditLoopOptions,
  executeOptions: ExecuteWriterCommandOptions = {},
): Promise<ToolkitResult<z.infer<typeof platformAuditLoopOutputDataSchema>>> {
  const request = platformAuditLoopInputSchema.safeParse(input);
  if (!request.success || snapshot.projectId !== options.expectedProjectId) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The official Platform component audit request is invalid.",
        recoveryInstruction:
          "Provide a new request UUID and the exact bound Figma page file ID.",
        target: { logicalId: "platform-audit", type: "operation" },
      }),
    );
  }
  const planned = createFigmaPlatformAuditPlan(snapshot, {
    fileBindingId: request.data.fileBindingId,
  });
  if (!planned.ok) return planned;
  const command: WriterCommandEnvelope = {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    command: {
      payload: { plan: planned.data },
      type: "audit.platform-components.scan",
    },
    idempotencyKey: `platform-audit:${request.data.requestId}`,
    operationId: request.data.requestId,
    projectId: snapshot.projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "hatchkit-mcp" },
    target: {
      fileBindingId: planned.data.fileBindingId,
      kind: "figma-file",
      stableId: `${snapshot.projectId}/figma-file/page`,
    },
  };
  const executed = await options.writer.execute(command, executeOptions);
  if (!executed.ok) return executed;
  const audit = figmaPlatformAuditResultSchema.safeParse(executed.data.result);
  if (executed.data.status !== "succeeded" || !audit.success) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message:
          "The completed read-only operation did not contain a valid Platform audit report.",
        recoveryInstruction:
          "Update the Bridge and Figma Plugin to matching versions, then run a new audit.",
        target: { logicalId: executed.data.operationId, type: "operation" },
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
