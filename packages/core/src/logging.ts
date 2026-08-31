import type {
  ErrorCategory,
  ErrorCode,
  ErrorTarget,
  ToolkitError,
} from "./errors.js";
import type { JsonObject } from "./json.js";

export const LOG_SCHEMA_VERSION = "1.0.0" as const;

export type LogLevel = "debug" | "error" | "info" | "warn";

export type LogSource = "cli" | "core" | "figma-plugin" | "mcp-server";

export interface LogCorrelation {
  readonly idempotencyKeyHash?: string;
  readonly operationId?: string;
  readonly requestId?: string;
}

export interface LogErrorReference {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
}

export interface LogEvent {
  readonly attributes?: JsonObject;
  readonly correlation?: LogCorrelation;
  readonly error?: LogErrorReference;
  readonly event: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly schemaVersion: typeof LOG_SCHEMA_VERSION;
  readonly source: LogSource;
  readonly target?: ErrorTarget;
  readonly timestamp: string;
}

export interface CreateLogEventInput {
  readonly attributes?: JsonObject;
  readonly correlation?: LogCorrelation;
  readonly error?: ToolkitError;
  readonly event: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly source: LogSource;
  readonly target?: ErrorTarget;
  readonly timestamp: string;
}

export function createLogEvent(input: CreateLogEventInput): LogEvent {
  return {
    event: input.event,
    level: input.level,
    message: input.message,
    schemaVersion: LOG_SCHEMA_VERSION,
    source: input.source,
    timestamp: input.timestamp,
    ...(input.attributes === undefined ? {} : { attributes: input.attributes }),
    ...(input.correlation === undefined
      ? {}
      : { correlation: input.correlation }),
    ...(input.error === undefined
      ? {}
      : {
          error: {
            category: input.error.category,
            code: input.error.code,
          },
        }),
    ...(input.target === undefined ? {} : { target: input.target }),
  };
}
