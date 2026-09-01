import { createHash } from "node:crypto";

import {
  canonicalizeJson,
  createFailureResult,
  createSuccessResult,
  createToolkitError,
  toWriterCommandFingerprintSubject,
  writerCommandEnvelopeSchema,
  writerPluginResultSchema,
  type ErrorCode,
  type JsonObject,
  type ToolkitError,
  type ToolkitResult,
  type WriterCommandDelivery,
  type WriterCommandEnvelope,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

import type {
  OperationLog,
  OperationLogError,
  OperationLogEvent,
  WriterOperationStatus,
} from "./operation-log.js";

export const WRITER_OPERATION_SCHEMA_VERSION = "1.0.0" as const;

export interface WriterOperation {
  readonly attempt: number;
  readonly commandFingerprint: string;
  readonly commandType: string;
  readonly completedAt?: string;
  readonly dispatchedAt?: string;
  readonly error?: ToolkitError;
  readonly idempotencyKeyHash: string;
  readonly operationId: string;
  readonly projectId: string;
  readonly queuedAt: string;
  readonly result?: JsonObject;
  readonly schemaVersion: typeof WRITER_OPERATION_SCHEMA_VERSION;
  readonly status: WriterOperationStatus;
  readonly targetStableId: string;
}

export interface WriterQueueSnapshot {
  readonly inFlightOperationId: string | null;
  readonly operations: readonly WriterOperation[];
  readonly queuedOperationIds: readonly string[];
}

export interface WriterQueueSubmission {
  readonly idempotentReplay: boolean;
  readonly operation: WriterOperation;
}

export interface WriterResultAcceptance {
  readonly operation: WriterOperation;
  readonly replayed: boolean;
}

export interface WriterQueueOptions {
  readonly leaseMs: number;
  readonly log: OperationLog;
  readonly now: () => Date;
  readonly nowMonotonicMs: () => number;
}

interface StoredOperation {
  attempt: number;
  command?: WriterCommandEnvelope;
  commandFingerprint: string;
  commandType: string;
  completedAt?: string | undefined;
  dispatchedAt?: string | undefined;
  error?: ToolkitError | undefined;
  idempotencyKeyHash: string;
  leaseStartedAtMs?: number | undefined;
  operationId: string;
  projectId: string;
  queuedAt: string;
  result?: JsonObject | undefined;
  status: WriterOperationStatus;
  targetStableId: string;
}

export interface WriterQueue {
  readonly acceptResult: (
    result: unknown,
  ) => Promise<ToolkitResult<WriterResultAcceptance>>;
  readonly disconnectWriter: () => Promise<void>;
  readonly getOperation: (
    operationId: string,
  ) => ToolkitResult<WriterOperation>;
  readonly initialize: () => Promise<void>;
  readonly leaseNext: () => Promise<WriterCommandDelivery | null>;
  readonly snapshot: () => WriterQueueSnapshot;
  readonly submit: (
    command: unknown,
  ) => Promise<ToolkitResult<WriterQueueSubmission>>;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function commandFingerprint(command: WriterCommandEnvelope): string {
  return sha256(canonicalizeJson(toWriterCommandFingerprintSubject(command)));
}

function operationError(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
  operationId?: string,
): ToolkitError {
  return createToolkitError({
    code,
    message,
    recoveryInstruction,
    ...(operationId === undefined
      ? {}
      : { target: { logicalId: operationId, type: "operation" } }),
  });
}

function publicOperation(operation: StoredOperation): WriterOperation {
  return {
    attempt: operation.attempt,
    commandFingerprint: operation.commandFingerprint,
    commandType: operation.commandType,
    idempotencyKeyHash: operation.idempotencyKeyHash,
    operationId: operation.operationId,
    projectId: operation.projectId,
    queuedAt: operation.queuedAt,
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: operation.status,
    targetStableId: operation.targetStableId,
    ...(operation.completedAt === undefined
      ? {}
      : { completedAt: operation.completedAt }),
    ...(operation.dispatchedAt === undefined
      ? {}
      : { dispatchedAt: operation.dispatchedAt }),
    ...(operation.error === undefined ? {} : { error: operation.error }),
    ...(operation.result === undefined ? {} : { result: operation.result }),
  };
}

function logError(error: ToolkitError): OperationLogError {
  return {
    category: error.category,
    code: error.code,
    message: error.message,
    recoveryAction: error.recovery.action,
    recoveryInstruction: error.recovery.instruction,
    retry: error.recovery.retry,
  };
}

function eventFor(
  operation: StoredOperation,
  timestamp: string,
): OperationLogEvent {
  return {
    attempt: operation.attempt,
    commandFingerprint: operation.commandFingerprint,
    commandType: operation.commandType,
    idempotencyKeyHash: operation.idempotencyKeyHash,
    operationId: operation.operationId,
    projectId: operation.projectId,
    schemaVersion: "1.0.0",
    status: operation.status,
    targetStableId: operation.targetStableId,
    timestamp,
    ...(operation.error === undefined
      ? {}
      : { error: logError(operation.error) }),
    ...(operation.result === undefined ? {} : { result: operation.result }),
  };
}

function restoreError(
  error: OperationLogError | undefined,
): ToolkitError | undefined {
  if (error === undefined) {
    return undefined;
  }
  return operationError(error.code, error.message, error.recoveryInstruction);
}

export function createWriterQueue(options: WriterQueueOptions): WriterQueue {
  if (!Number.isSafeInteger(options.leaseMs) || options.leaseMs <= 0) {
    throw new Error("Writer queue leaseMs must be a positive integer.");
  }

  const operations = new Map<string, StoredOperation>();
  const byIdempotencyHash = new Map<string, string>();
  const queued: string[] = [];
  let inFlightOperationId: string | null = null;
  let initialized = false;

  async function append(
    operation: StoredOperation,
    timestamp: string,
  ): Promise<void> {
    await options.log.append(eventFor(operation, timestamp));
  }

  async function requeueInFlight(): Promise<void> {
    if (inFlightOperationId === null) {
      return;
    }
    const operation = operations.get(inFlightOperationId);
    inFlightOperationId = null;
    if (operation === undefined || operation.status !== "dispatched") {
      return;
    }
    operation.status = "queued";
    operation.dispatchedAt = undefined;
    operation.leaseStartedAtMs = undefined;
    if (!queued.includes(operation.operationId)) {
      queued.unshift(operation.operationId);
    }
    await append(operation, options.now().toISOString());
  }

  async function releaseExpiredLease(): Promise<void> {
    if (inFlightOperationId === null) {
      return;
    }
    const operation = operations.get(inFlightOperationId);
    if (
      operation?.leaseStartedAtMs !== undefined &&
      options.nowMonotonicMs() - operation.leaseStartedAtMs >= options.leaseMs
    ) {
      await requeueInFlight();
    }
  }

  function requireInitialized(): void {
    if (!initialized) {
      throw new Error("Writer queue must be initialized before use.");
    }
  }

  return {
    async initialize() {
      if (initialized) {
        return;
      }
      const now = options.now();
      const events = await options.log.readEvents(now);
      for (const event of events) {
        const existingByOperation = operations.get(event.operationId);
        if (
          existingByOperation !== undefined &&
          (existingByOperation.commandFingerprint !==
            event.commandFingerprint ||
            existingByOperation.idempotencyKeyHash !== event.idempotencyKeyHash)
        ) {
          throw new Error(
            "Operation log contains a conflicting operation identity.",
          );
        }
        const existingId = byIdempotencyHash.get(event.idempotencyKeyHash);
        if (existingId !== undefined && existingId !== event.operationId) {
          throw new Error(
            "Operation log contains a conflicting idempotency identity.",
          );
        }
        const restored: StoredOperation = {
          attempt: event.attempt,
          commandFingerprint: event.commandFingerprint,
          commandType: event.commandType,
          idempotencyKeyHash: event.idempotencyKeyHash,
          operationId: event.operationId,
          projectId: event.projectId,
          queuedAt: existingByOperation?.queuedAt ?? event.timestamp,
          status: event.status,
          targetStableId: event.targetStableId,
          ...(event.error === undefined
            ? {}
            : { error: restoreError(event.error) }),
          ...(event.result === undefined ? {} : { result: event.result }),
          ...(event.status === "dispatched"
            ? { dispatchedAt: event.timestamp }
            : {}),
          ...(["failed", "partial", "succeeded"].includes(event.status)
            ? { completedAt: event.timestamp }
            : {}),
        };
        operations.set(event.operationId, restored);
        byIdempotencyHash.set(event.idempotencyKeyHash, event.operationId);
      }

      initialized = true;
      for (const operation of operations.values()) {
        if (
          operation.status === "queued" ||
          operation.status === "dispatched"
        ) {
          operation.status = "interrupted";
          operation.dispatchedAt = undefined;
          operation.error = operationError(
            "PARTIAL_WRITE",
            "The previous local Writer process stopped before the operation completed.",
            "Resubmit the same command with the original idempotency key to inspect and resume safely.",
            operation.operationId,
          );
          await append(operation, now.toISOString());
        }
      }
    },

    async submit(input) {
      requireInitialized();
      const parsed = writerCommandEnvelopeSchema.safeParse(input);
      if (!parsed.success) {
        return createFailureResult(
          operationError(
            "VALIDATION_FAILED",
            "Writer Command does not match the FIG-002 protocol.",
            "Correct the command fields and submit it again.",
          ),
        );
      }
      const command = parsed.data;
      const fingerprint = commandFingerprint(command);
      const idempotencyKeyHash = sha256(command.idempotencyKey);
      const existingId = byIdempotencyHash.get(idempotencyKeyHash);
      if (existingId !== undefined) {
        const existing = operations.get(existingId);
        if (existing === undefined) {
          throw new Error("Writer idempotency index is inconsistent.");
        }
        if (existing.commandFingerprint !== fingerprint) {
          return createFailureResult(
            operationError(
              "IDEMPOTENCY_CONFLICT",
              "The idempotency key is already bound to a different Writer Command.",
              "Reuse the original command or submit the new command with a new idempotency key.",
              existing.operationId,
            ),
          );
        }
        if (existing.status === "interrupted") {
          existing.command = { ...command, operationId: existing.operationId };
          existing.status = "queued";
          existing.error = undefined;
          existing.result = undefined;
          existing.completedAt = undefined;
          existing.queuedAt = options.now().toISOString();
          queued.push(existing.operationId);
          await append(existing, existing.queuedAt);
        }
        return createSuccessResult({
          idempotentReplay: true,
          operation: publicOperation(existing),
        });
      }

      const existingOperation = operations.get(command.operationId);
      if (existingOperation !== undefined) {
        return createFailureResult(
          operationError(
            "OPERATION_ID_CONFLICT",
            "The operation ID is already assigned to another Writer Command.",
            "Reuse the original command or create a new operation ID.",
            command.operationId,
          ),
        );
      }

      const timestamp = options.now().toISOString();
      const operation: StoredOperation = {
        attempt: 0,
        command,
        commandFingerprint: fingerprint,
        commandType: command.command.type,
        idempotencyKeyHash,
        operationId: command.operationId,
        projectId: command.projectId,
        queuedAt: timestamp,
        status: "queued",
        targetStableId: command.target.stableId,
      };
      operations.set(operation.operationId, operation);
      byIdempotencyHash.set(idempotencyKeyHash, operation.operationId);
      queued.push(operation.operationId);
      await append(operation, timestamp);
      return createSuccessResult({
        idempotentReplay: false,
        operation: publicOperation(operation),
      });
    },

    async leaseNext() {
      requireInitialized();
      await releaseExpiredLease();
      if (inFlightOperationId !== null) {
        return null;
      }
      while (queued.length > 0) {
        const operationId = queued.shift();
        if (operationId === undefined) {
          break;
        }
        const operation = operations.get(operationId);
        if (operation?.status !== "queued" || operation.command === undefined) {
          continue;
        }
        const timestamp = options.now().toISOString();
        operation.status = "dispatched";
        operation.attempt += 1;
        operation.dispatchedAt = timestamp;
        operation.leaseStartedAtMs = options.nowMonotonicMs();
        inFlightOperationId = operation.operationId;
        await append(operation, timestamp);
        return { ...operation.command, attempt: operation.attempt };
      }
      return null;
    },

    async acceptResult(input) {
      requireInitialized();
      const parsed = writerPluginResultSchema.safeParse(input);
      if (!parsed.success) {
        return createFailureResult(
          operationError(
            "VALIDATION_FAILED",
            "Plugin Result does not match the FIG-002 protocol.",
            "Correct the result envelope and report it again.",
          ),
        );
      }
      const result: WriterPluginResult = parsed.data;
      const operation = operations.get(result.operationId);
      if (operation === undefined) {
        return createFailureResult(
          operationError(
            "IDENTITY_NOT_FOUND",
            "The Plugin Result references an unknown operation.",
            "Report a result only for the active Writer Command.",
            result.operationId,
          ),
        );
      }
      if (["failed", "partial", "succeeded"].includes(operation.status)) {
        return createSuccessResult({
          operation: publicOperation(operation),
          replayed: true,
        });
      }
      if (
        operation.status !== "dispatched" ||
        inFlightOperationId !== operation.operationId
      ) {
        return createFailureResult(
          operationError(
            "OPERATION_ID_CONFLICT",
            "The Plugin Result does not belong to the currently dispatched Writer Command.",
            "Poll and execute the active operation before reporting its result.",
            result.operationId,
          ),
        );
      }

      const timestamp = options.now().toISOString();
      operation.completedAt = timestamp;
      operation.leaseStartedAtMs = undefined;
      operation.dispatchedAt ??= timestamp;
      if (result.ok) {
        operation.status = "succeeded";
        operation.result = result.result;
        operation.error = undefined;
      } else {
        operation.status =
          result.error.code === "PARTIAL_WRITE" ? "partial" : "failed";
        operation.error = operationError(
          result.error.code,
          result.error.message,
          result.error.recoveryInstruction,
          operation.operationId,
        );
        operation.result = undefined;
      }
      queued.splice(
        0,
        queued.length,
        ...queued.filter((id) => id !== operation.operationId),
      );
      if (inFlightOperationId === operation.operationId) {
        inFlightOperationId = null;
      }
      await append(operation, timestamp);
      return createSuccessResult({
        operation: publicOperation(operation),
        replayed: false,
      });
    },

    async disconnectWriter() {
      requireInitialized();
      await requeueInFlight();
    },

    getOperation(operationId) {
      requireInitialized();
      const operation = operations.get(operationId);
      return operation === undefined
        ? createFailureResult(
            operationError(
              "IDENTITY_NOT_FOUND",
              "The Writer Operation was not found.",
              "Use the operation ID returned when the command was submitted.",
              operationId,
            ),
          )
        : createSuccessResult(publicOperation(operation));
    },

    snapshot() {
      requireInitialized();
      return {
        inFlightOperationId,
        operations: [...operations.values()]
          .map(publicOperation)
          .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt)),
        queuedOperationIds: [...queued],
      };
    },
  };
}
