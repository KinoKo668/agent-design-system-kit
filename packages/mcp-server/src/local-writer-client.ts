import {
  ERROR_DEFINITIONS,
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFailureResult,
  createSuccessResult,
  createToolkitError,
  type ErrorCode,
  type ToolkitError,
  type ToolkitResult,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import * as z from "zod";

import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

export const LOCAL_WRITER_DEFAULT_URL = "http://127.0.0.1:38451" as const;
export const LOCAL_WRITER_DEFAULT_TIMEOUT_MS = 30_000;
export const LOCAL_WRITER_MAX_TIMEOUT_MS = 120_000;

const errorCodes = Object.keys(ERROR_DEFINITIONS) as [
  ErrorCode,
  ...ErrorCode[],
];
const jsonObjectSchema = z.record(z.string(), z.json());
const toolkitErrorSchema = z
  .object({
    category: z.enum([
      "approval",
      "identity",
      "internal",
      "migration",
      "operation",
      "security",
      "transport",
      "validation",
      "version",
    ]),
    code: z.enum(errorCodes),
    context: z
      .object({
        actual: jsonObjectSchema.optional(),
        completedSteps: z.array(z.string()).optional(),
        details: jsonObjectSchema.optional(),
        expected: jsonObjectSchema.optional(),
        missingConditions: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    message: z.string().min(1).max(2_048),
    recovery: z
      .object({
        action: z.string().min(1).max(128),
        instruction: z.string().min(1).max(2_048),
        retry: z.enum([
          "do_not_retry",
          "retry_after_correction",
          "retry_after_external_change",
          "retry_same_request",
        ]),
      })
      .strict(),
    target: z
      .object({
        logicalId: z.string().min(1).max(320),
        type: z.enum([
          "approval",
          "brief",
          "command",
          "component",
          "credential",
          "direction",
          "figma-asset",
          "figma-file",
          "operation",
          "project",
          "registry",
          "schema",
          "token",
          "token-set",
        ]),
        version: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((error, context) => {
    const definition = ERROR_DEFINITIONS[error.code];
    if (
      error.category !== definition.category ||
      error.recovery.action !== definition.recoveryAction ||
      error.recovery.retry !== definition.retry
    ) {
      context.addIssue({
        code: "custom",
        message: "Error metadata must match the shared Core definition.",
      });
    }
  });

export const writerOperationSchema = z
  .object({
    attempt: z.number().int().nonnegative(),
    commandFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    commandType: z.string().min(1).max(160),
    completedAt: z.iso.datetime({ offset: false }).optional(),
    dispatchedAt: z.iso.datetime({ offset: false }).optional(),
    error: toolkitErrorSchema.optional(),
    idempotencyKeyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    operationId: z.uuid(),
    projectId: z.string().min(1).max(64),
    queuedAt: z.iso.datetime({ offset: false }),
    result: jsonObjectSchema.optional(),
    schemaVersion: z.literal(WRITER_OPERATION_SCHEMA_VERSION),
    status: z.enum([
      "dispatched",
      "failed",
      "interrupted",
      "partial",
      "queued",
      "succeeded",
    ]),
    targetStableId: z.string().min(1).max(192),
  })
  .strict();

const bridgeFailureSchema = z
  .object({
    error: toolkitErrorSchema,
    ok: z.literal(false),
    schemaVersion: z.literal("1.0.0"),
    warnings: z.array(z.unknown()),
  })
  .strict();
const bridgeSubmissionSchema = z
  .object({
    data: z
      .object({
        idempotentReplay: z.boolean(),
        operation: writerOperationSchema,
      })
      .strict(),
    ok: z.literal(true),
    schemaVersion: z.literal("1.0.0"),
    warnings: z.array(z.unknown()),
  })
  .strict();
const bridgeOperationSchema = z
  .object({
    data: writerOperationSchema,
    ok: z.literal(true),
    schemaVersion: z.literal("1.0.0"),
    warnings: z.array(z.unknown()),
  })
  .strict();

export interface LocalWriterClientOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly nowMonotonicMs?: () => number;
  readonly pollIntervalMs?: number;
  readonly sessionToken: string;
  readonly url?: string;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

export interface ExecuteWriterCommandOptions {
  readonly timeoutMs?: number;
}

export interface LocalWriterClient {
  readonly execute: (
    command: WriterCommandEnvelope,
    options?: ExecuteWriterCommandOptions,
  ) => Promise<ToolkitResult<WriterOperation>>;
}

function transportFailure(message: string): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "TRANSPORT_UNAVAILABLE",
      message,
      recoveryInstruction:
        "Start the local Figma Bridge, connect the bound Plugin, and retry the same request ID.",
      target: { logicalId: "local-figma-bridge", type: "operation" },
    }),
  );
}

function timeoutFailure(operationId: string): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "OPERATION_TIMEOUT",
      message: "The Figma Writer did not reach a terminal state in time.",
      recoveryInstruction:
        "Inspect the Plugin and Bridge, then retry with the same request ID so the existing operation is resumed safely.",
      target: { logicalId: operationId, type: "operation" },
    }),
  );
}

export function normalizeLocalWriterUrl(input: string): string {
  const url = new URL(input);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new TypeError(
      "Local Writer URL must be an HTTP 127.0.0.1 origin without credentials, path, query, or fragment.",
    );
  }
  return url.origin;
}

function positiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new TypeError(
      `${name} must be a positive integer no greater than ${String(maximum)}.`,
    );
  }
  return value;
}

function failureFromResponse(value: unknown): ToolkitResult<never> | null {
  const parsed = bridgeFailureSchema.safeParse(value);
  return parsed.success
    ? createFailureResult(parsed.data.error as ToolkitError)
    : null;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 256 * 1_024) {
    throw new Error("Bridge response exceeded the local safety limit.");
  }
  return JSON.parse(text) as unknown;
}

function isTerminal(operation: WriterOperation): boolean {
  return ["failed", "interrupted", "partial", "succeeded"].includes(
    operation.status,
  );
}

function terminalResult(
  operation: WriterOperation,
): ToolkitResult<WriterOperation> {
  if (operation.status === "succeeded") return createSuccessResult(operation);
  if (operation.error !== undefined)
    return createFailureResult(operation.error);
  return createFailureResult(
    createToolkitError({
      code: "PARTIAL_WRITE",
      message: `The Writer Operation ended as '${operation.status}' without structured recovery details.`,
      recoveryInstruction:
        "Inspect the local Operation Log and retry the same request ID only after confirming the Figma state.",
      target: { logicalId: operation.operationId, type: "operation" },
    }),
  );
}

export function createLocalWriterClient(
  options: LocalWriterClientOptions,
): LocalWriterClient {
  if (options.sessionToken.length < 32 || options.sessionToken.length > 256) {
    throw new TypeError(
      "Local Writer Session Token must contain 32 to 256 characters.",
    );
  }
  const baseUrl = normalizeLocalWriterUrl(
    options.url ?? LOCAL_WRITER_DEFAULT_URL,
  );
  const request = options.fetch ?? globalThis.fetch;
  const nowMonotonicMs = options.nowMonotonicMs ?? (() => performance.now());
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pollIntervalMs = positiveInteger(
    options.pollIntervalMs ?? 250,
    "pollIntervalMs",
    5_000,
  );

  async function post(path: string, body: unknown): Promise<unknown> {
    const response = await request(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${options.sessionToken}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    return parseResponse(response);
  }

  return {
    async execute(command, executeOptions = {}) {
      const timeoutMs = positiveInteger(
        executeOptions.timeoutMs ?? LOCAL_WRITER_DEFAULT_TIMEOUT_MS,
        "timeoutMs",
        LOCAL_WRITER_MAX_TIMEOUT_MS,
      );
      const startedAt = nowMonotonicMs();
      let submission: unknown;
      try {
        submission = await post("/v1/operations", command);
      } catch {
        return transportFailure(
          "The MCP server could not submit the command to the local Figma Bridge.",
        );
      }
      const rejected = failureFromResponse(submission);
      if (rejected !== null) return rejected;
      const parsedSubmission = bridgeSubmissionSchema.safeParse(submission);
      if (!parsedSubmission.success) {
        return transportFailure(
          "The local Figma Bridge returned an invalid submission response.",
        );
      }
      let operation = parsedSubmission.data.data.operation as WriterOperation;
      if (isTerminal(operation)) return terminalResult(operation);

      while (nowMonotonicMs() - startedAt < timeoutMs) {
        await wait(pollIntervalMs);
        let lookup: unknown;
        try {
          lookup = await post("/v1/operations/get", {
            operationId: operation.operationId,
            schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
          });
        } catch {
          return transportFailure(
            "The MCP server lost contact with the local Figma Bridge while waiting for the operation.",
          );
        }
        const lookupRejected = failureFromResponse(lookup);
        if (lookupRejected !== null) return lookupRejected;
        const parsedLookup = bridgeOperationSchema.safeParse(lookup);
        if (!parsedLookup.success) {
          return transportFailure(
            "The local Figma Bridge returned an invalid operation response.",
          );
        }
        operation = parsedLookup.data.data as WriterOperation;
        if (isTerminal(operation)) return terminalResult(operation);
      }
      return timeoutFailure(operation.operationId);
    },
  };
}

export type { WriterOperation };
