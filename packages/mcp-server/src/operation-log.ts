import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  type FileHandle,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  ERROR_DEFINITIONS,
  redactJsonObject,
  type ErrorCategory,
  type ErrorCode,
  type JsonObject,
  type RecoveryAction,
  type RetryDirective,
} from "@agent-design-system-kit/core";
import * as z from "zod";

export const OPERATION_LOG_SCHEMA_VERSION = "1.0.0" as const;
export const OPERATION_LOG_RETENTION_DAYS = 30;

export type WriterOperationStatus =
  "dispatched" | "failed" | "interrupted" | "partial" | "queued" | "succeeded";

export interface OperationLogError extends JsonObject {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly message: string;
  readonly recoveryAction: RecoveryAction;
  readonly recoveryInstruction: string;
  readonly retry: RetryDirective;
}

export interface OperationLogEvent extends JsonObject {
  readonly attempt: number;
  readonly commandFingerprint: string;
  readonly commandType: string;
  readonly error?: OperationLogError;
  readonly idempotencyKeyHash: string;
  readonly operationId: string;
  readonly projectId: string;
  readonly result?: JsonObject;
  readonly schemaVersion: typeof OPERATION_LOG_SCHEMA_VERSION;
  readonly status: WriterOperationStatus;
  readonly targetStableId: string;
  readonly timestamp: string;
}

const errorCodes = Object.keys(ERROR_DEFINITIONS) as [
  ErrorCode,
  ...ErrorCode[],
];
const errorCategories = [
  "approval",
  "identity",
  "internal",
  "migration",
  "operation",
  "security",
  "transport",
  "validation",
  "version",
] as const;
const retryDirectives = [
  "do_not_retry",
  "retry_after_correction",
  "retry_after_external_change",
  "retry_same_request",
] as const;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const operationLogErrorSchema = z
  .object({
    category: z.enum(errorCategories),
    code: z.enum(errorCodes),
    message: z.string().min(1).max(2048),
    recoveryAction: z.string().min(1).max(128),
    recoveryInstruction: z.string().min(1).max(2048),
    retry: z.enum(retryDirectives),
  })
  .strict()
  .superRefine((error, context) => {
    const definition = ERROR_DEFINITIONS[error.code];
    if (
      error.category !== definition.category ||
      error.recoveryAction !== definition.recoveryAction ||
      error.retry !== definition.retry
    ) {
      context.addIssue({
        code: "custom",
        message: "Error metadata must match the shared Core definition.",
      });
    }
  });

export const operationLogEventSchema = z
  .object({
    attempt: z.number().int().nonnegative(),
    commandFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    commandType: z.string().min(1).max(160),
    error: operationLogErrorSchema.optional(),
    idempotencyKeyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    operationId: z.uuid().max(64),
    projectId: z.string().min(1).max(64),
    result: z.record(z.string(), jsonValueSchema).optional(),
    schemaVersion: z.literal(OPERATION_LOG_SCHEMA_VERSION),
    status: z.enum([
      "dispatched",
      "failed",
      "interrupted",
      "partial",
      "queued",
      "succeeded",
    ]),
    targetStableId: z.string().min(1).max(192),
    timestamp: z.iso.datetime({ offset: false }),
  })
  .strict();

const LOG_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.ndjson$/u;
const MAX_LOG_FILE_BYTES = 8 * 1024 * 1024;
const MAX_LOG_LINE_BYTES = 256 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OperationLogOptions {
  readonly directory: string;
  readonly retentionDays?: number;
  readonly sensitiveValues: readonly string[];
}

export interface OperationLog {
  readonly append: (event: OperationLogEvent) => Promise<void>;
  readonly readEvents: (now: Date) => Promise<readonly OperationLogEvent[]>;
}

function dateFileName(timestamp: string): string {
  return `${timestamp.slice(0, 10)}.ndjson`;
}

function retentionCutoff(now: Date, retentionDays: number): number {
  return now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
}

async function assertSafeDirectory(directory: string): Promise<void> {
  await mkdir(directory, { mode: 0o700, recursive: true });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Operation log path must be a real local directory.");
  }
}

async function openAppendOnly(path: string): Promise<FileHandle> {
  return open(
    path,
    constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_WRONLY,
    0o600,
  );
}

export function createOperationLog(options: OperationLogOptions): OperationLog {
  const directory = resolve(options.directory);
  const retentionDays = options.retentionDays ?? OPERATION_LOG_RETENTION_DAYS;
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
    throw new Error("Operation log retentionDays must be a positive integer.");
  }

  let appendChain = Promise.resolve();

  return {
    append(event) {
      const parsed = operationLogEventSchema.parse(event) as OperationLogEvent;
      const redacted = operationLogEventSchema.parse(
        redactJsonObject(parsed, {
          sensitiveValues: options.sensitiveValues,
        }),
      ) as OperationLogEvent;
      const line = `${JSON.stringify(redacted)}\n`;
      if (Buffer.byteLength(line) > MAX_LOG_LINE_BYTES) {
        return Promise.reject(
          new Error("Operation log event exceeds the 256 KiB limit."),
        );
      }
      appendChain = appendChain.then(async () => {
        await assertSafeDirectory(directory);
        const path = join(directory, dateFileName(redacted.timestamp));
        const handle = await openAppendOnly(path);
        try {
          await handle.writeFile(line, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
      });
      return appendChain;
    },

    async readEvents(now) {
      await appendChain;
      await assertSafeDirectory(directory);
      const cutoff = retentionCutoff(now, retentionDays);
      const entries = (await readdir(directory)).sort();
      const events: OperationLogEvent[] = [];

      for (const entry of entries) {
        if (!LOG_FILE_PATTERN.test(entry)) {
          continue;
        }
        const fileDate = Date.parse(`${entry.slice(0, 10)}T00:00:00.000Z`);
        if (!Number.isFinite(fileDate) || fileDate + DAY_MS <= cutoff) {
          continue;
        }
        const path = join(directory, basename(entry));
        const metadata = await lstat(path);
        if (
          !metadata.isFile() ||
          metadata.isSymbolicLink() ||
          metadata.size > MAX_LOG_FILE_BYTES
        ) {
          throw new Error("Operation log contains an unsafe file.");
        }
        const content = await readFile(path, "utf8");
        for (const [index, line] of content.split("\n").entries()) {
          if (line.length === 0) {
            continue;
          }
          if (Buffer.byteLength(line) > MAX_LOG_LINE_BYTES) {
            throw new Error("Operation log contains an oversized event.");
          }
          try {
            const event = operationLogEventSchema.parse(
              JSON.parse(line),
            ) as OperationLogEvent;
            if (Date.parse(event.timestamp) >= cutoff) {
              events.push(event);
            }
          } catch {
            throw new Error(
              `Operation log '${entry}' contains an invalid event at line ${String(index + 1)}.`,
            );
          }
        }
      }

      return events;
    },
  };
}
