import {
  ERROR_DEFINITIONS,
  type ErrorCode,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

export const FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION = "1.0.0" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STABLE_ID_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/u;
const STABLE_ASSET_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/u;
const DELIVERY_KEYS = new Set([
  "approval",
  "attempt",
  "command",
  "idempotencyKey",
  "operationId",
  "projectId",
  "schemaVersion",
  "source",
  "target",
]);
const APPROVAL_KEYS = new Set(["mode", "reason"]);
const COMMAND_KEYS = new Set(["payload", "type"]);
const SOURCE_KEYS = new Set(["client"]);
const TARGET_KEYS = new Set(["kind", "stableId"]);
const SUCCESS_RESULT_KEYS = new Set([
  "ok",
  "operationId",
  "pluginInstanceId",
  "result",
  "schemaVersion",
]);
const FAILURE_RESULT_KEYS = new Set([
  "error",
  "ok",
  "operationId",
  "pluginInstanceId",
  "schemaVersion",
]);
const PLUGIN_ERROR_KEYS = new Set(["code", "message", "recoveryInstruction"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isUuid(value: unknown): value is string {
  return isBoundedString(value, 1, 64) && UUID_PATTERN.test(value);
}

function isStableIdSegment(value: unknown): value is string {
  return isBoundedString(value, 1, 64) && STABLE_ID_SEGMENT_PATTERN.test(value);
}

function isStableAssetId(value: unknown): value is string {
  return isBoundedString(value, 1, 192) && STABLE_ASSET_ID_PATTERN.test(value);
}

export function isWriterCommandDelivery(
  value: unknown,
): value is WriterCommandDelivery {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, DELIVERY_KEYS) &&
    value.schemaVersion === FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION &&
    isUuid(value.operationId) &&
    isBoundedString(value.idempotencyKey, 1, 256) &&
    isStableIdSegment(value.projectId) &&
    Number.isSafeInteger(value.attempt) &&
    Number(value.attempt) > 0 &&
    isRecord(value.source) &&
    hasOnlyKeys(value.source, SOURCE_KEYS) &&
    isStableIdSegment(value.source.client) &&
    isRecord(value.target) &&
    hasOnlyKeys(value.target, TARGET_KEYS) &&
    value.target.kind === "plugin-session" &&
    isStableAssetId(value.target.stableId) &&
    isRecord(value.approval) &&
    hasOnlyKeys(value.approval, APPROVAL_KEYS) &&
    value.approval.mode === "not_required" &&
    value.approval.reason === "read_only_diagnostic" &&
    isRecord(value.command) &&
    hasOnlyKeys(value.command, COMMAND_KEYS) &&
    value.command.type === "writer.ping" &&
    isRecord(value.command.payload) &&
    Object.keys(value.command.payload).length === 0
  );
}

export function isWriterPluginResult(
  value: unknown,
): value is WriterPluginResult {
  if (
    !isRecord(value) ||
    value.schemaVersion !== FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION ||
    !isUuid(value.operationId) ||
    !isUuid(value.pluginInstanceId)
  ) {
    return false;
  }
  if (value.ok === true) {
    return (
      hasOnlyKeys(value, SUCCESS_RESULT_KEYS) &&
      isRecord(value.result) &&
      Object.keys(value.result).length === 1 &&
      value.result.pong === true
    );
  }
  if (
    value.ok !== false ||
    !hasOnlyKeys(value, FAILURE_RESULT_KEYS) ||
    !isRecord(value.error) ||
    !hasOnlyKeys(value.error, PLUGIN_ERROR_KEYS) ||
    typeof value.error.code !== "string" ||
    !Object.hasOwn(ERROR_DEFINITIONS, value.error.code) ||
    !isBoundedString(value.error.message, 1, 1024) ||
    !isBoundedString(value.error.recoveryInstruction, 1, 1024)
  ) {
    return false;
  }
  return ERROR_DEFINITIONS[value.error.code as ErrorCode] !== undefined;
}
