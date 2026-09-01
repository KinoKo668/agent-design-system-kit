import {
  ERROR_DEFINITIONS,
  type ErrorCategory,
  type ErrorCode,
  type RetryDirective,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

import {
  isWriterCommandDelivery,
  isWriterPluginResult,
} from "./writer-message-validation.js";
import type { FigmaLibraryFileBinding } from "./variables-writer.js";

export const FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION = "1.0.0" as const;
export const FILE_BINDING_CONFIRMATION =
  "bind-current-file-as-design-system-library" as const;

export type ConnectionStatus =
  "connected" | "connecting" | "disconnected" | "reconnecting";

export type ApprovalStatus =
  "approved" | "blocked" | "checking" | "not_checked";

export type OperationStatus =
  "failed" | "idle" | "queued" | "running" | "succeeded";

export type StatusTone = "danger" | "info" | "neutral" | "success" | "warning";

const CONNECTION_STATUSES = new Set<ConnectionStatus>([
  "connected",
  "connecting",
  "disconnected",
  "reconnecting",
]);
const APPROVAL_STATUSES = new Set<ApprovalStatus>([
  "approved",
  "blocked",
  "checking",
  "not_checked",
]);
const OPERATION_STATUSES = new Set<OperationStatus>([
  "failed",
  "idle",
  "queued",
  "running",
  "succeeded",
]);
const SNAPSHOT_KEYS = new Set([
  "approval",
  "connection",
  "context",
  "error",
  "operation",
  "writeAuthorized",
]);
const CONTEXT_KEYS = new Set(["fileName", "pageName"]);
const CONNECTION_KEYS = new Set(["detail", "endpoint", "status"]);
const APPROVAL_KEYS = new Set(["approvalId", "detail", "status", "subject"]);
const OPERATION_KEYS = new Set([
  "completedSteps",
  "detail",
  "operationId",
  "status",
  "step",
  "totalSteps",
]);
const ERROR_KEYS = new Set([
  "category",
  "code",
  "message",
  "recoveryInstruction",
  "retry",
]);
const UI_MESSAGE_KEYS = new Set(["schemaVersion", "type"]);
const FILE_BIND_MESSAGE_KEYS = new Set([
  "binding",
  "confirmation",
  "schemaVersion",
  "type",
]);
const EXECUTE_MESSAGE_KEYS = new Set([
  "command",
  "pluginInstanceId",
  "schemaVersion",
  "type",
]);
const STATUS_MESSAGE_KEYS = new Set(["schemaVersion", "snapshot", "type"]);
const CONTEXT_MESSAGE_KEYS = new Set(["context", "schemaVersion", "type"]);
const RESULT_MESSAGE_KEYS = new Set(["result", "schemaVersion", "type"]);
const FILE_BINDING_MESSAGE_KEYS = new Set([
  "binding",
  "error",
  "schemaVersion",
  "type",
]);
const FILE_BINDING_KEYS = new Set([
  "fileBindingId",
  "fileRole",
  "projectId",
  "schemaVersion",
]);

export interface FigmaDocumentContext {
  readonly fileName: string;
  readonly pageName: string;
}

export interface ConnectionStatusView {
  readonly detail: string;
  readonly endpoint?: string;
  readonly status: ConnectionStatus;
}

export interface ApprovalStatusView {
  readonly approvalId?: string;
  readonly detail: string;
  readonly status: ApprovalStatus;
  readonly subject?: string;
}

export interface OperationStatusView {
  readonly completedSteps: number;
  readonly detail: string;
  readonly operationId?: string;
  readonly status: OperationStatus;
  readonly step?: string;
  readonly totalSteps: number;
}

export interface PluginErrorView {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly message: string;
  readonly recoveryInstruction: string;
  readonly retry: RetryDirective;
}

export interface WriterStatusSnapshot {
  readonly approval: ApprovalStatusView;
  readonly connection: ConnectionStatusView;
  readonly context: FigmaDocumentContext;
  readonly error: PluginErrorView | null;
  readonly operation: OperationStatusView;
  readonly writeAuthorized: boolean;
}

export interface StatusPresentation {
  readonly label: string;
  readonly tone: StatusTone;
}

const CONNECTION_PRESENTATION = {
  connected: { label: "Connected", tone: "success" },
  connecting: { label: "Connecting", tone: "info" },
  disconnected: { label: "Not connected", tone: "neutral" },
  reconnecting: { label: "Reconnecting", tone: "warning" },
} as const satisfies Record<ConnectionStatus, StatusPresentation>;

const APPROVAL_PRESENTATION = {
  approved: { label: "Approved", tone: "success" },
  blocked: { label: "Blocked", tone: "danger" },
  checking: { label: "Checking", tone: "info" },
  not_checked: { label: "Not checked", tone: "neutral" },
} as const satisfies Record<ApprovalStatus, StatusPresentation>;

const OPERATION_PRESENTATION = {
  failed: { label: "Failed", tone: "danger" },
  idle: { label: "Idle", tone: "neutral" },
  queued: { label: "Queued", tone: "warning" },
  running: { label: "Running", tone: "info" },
  succeeded: { label: "Complete", tone: "success" },
} as const satisfies Record<OperationStatus, StatusPresentation>;

export type UiToMainMessage =
  | {
      readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
      readonly type: "ui.close";
    }
  | {
      readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
      readonly type: "ui.ready" | "ui.refresh";
    }
  | {
      readonly binding: FigmaLibraryFileBinding;
      readonly confirmation: typeof FILE_BINDING_CONFIRMATION;
      readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
      readonly type: "file.bind";
    }
  | {
      readonly command: WriterCommandDelivery;
      readonly pluginInstanceId: string;
      readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
      readonly type: "writer.execute";
    };

export interface WriterStatusMessage {
  readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
  readonly snapshot: WriterStatusSnapshot;
  readonly type: "writer.status";
}

export interface WriterContextMessage {
  readonly context: FigmaDocumentContext;
  readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
  readonly type: "writer.context";
}

export interface WriterResultMessage {
  readonly result: WriterPluginResult;
  readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
  readonly type: "writer.result";
}

export interface FigmaFileBindingMessage {
  readonly binding: FigmaLibraryFileBinding | null;
  readonly error: PluginErrorView | null;
  readonly schemaVersion: typeof FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION;
  readonly type: "file.binding";
}

export type MainToUiMessage =
  | FigmaFileBindingMessage
  | WriterContextMessage
  | WriterResultMessage
  | WriterStatusMessage;

export function createInitialWriterStatus(
  context: FigmaDocumentContext,
): WriterStatusSnapshot {
  return {
    approval: {
      detail: "No approval record has been checked for a write operation.",
      status: "not_checked",
    },
    connection: {
      detail: "Waiting for the local Bridge connection.",
      status: "disconnected",
    },
    context,
    error: null,
    operation: {
      completedSteps: 0,
      detail: "No writer operation is queued.",
      status: "idle",
      totalSteps: 0,
    },
    writeAuthorized: false,
  };
}

export function connectionPresentation(
  status: ConnectionStatus,
): StatusPresentation {
  return CONNECTION_PRESENTATION[status];
}

export function approvalPresentation(
  status: ApprovalStatus,
): StatusPresentation {
  return APPROVAL_PRESENTATION[status];
}

export function operationPresentation(
  status: OperationStatus,
): StatusPresentation {
  return OPERATION_PRESENTATION[status];
}

export function operationProgressPercent(
  operation: OperationStatusView,
): number {
  if (operation.status === "succeeded") {
    return 100;
  }
  if (operation.totalSteps <= 0) {
    return 0;
  }
  const completed = Math.max(
    0,
    Math.min(operation.completedSteps, operation.totalSteps),
  );
  return Math.round((completed / operation.totalSteps) * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isFigmaLibraryFileBinding(
  value: unknown,
): value is FigmaLibraryFileBinding {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, FILE_BINDING_KEYS) &&
    value.schemaVersion === "1.0.0" &&
    typeof value.projectId === "string" &&
    value.projectId.length <= 64 &&
    /^[a-z][a-z0-9-]*$/u.test(value.projectId) &&
    typeof value.fileBindingId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value.fileBindingId,
    ) &&
    value.fileRole === "design-system-library"
  );
}

function isPluginErrorView(value: unknown): value is PluginErrorView {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ERROR_KEYS) ||
    !isString(value.code)
  ) {
    return false;
  }
  const definition = Object.hasOwn(ERROR_DEFINITIONS, value.code)
    ? ERROR_DEFINITIONS[value.code as ErrorCode]
    : undefined;
  return (
    definition !== undefined &&
    value.category === definition.category &&
    value.retry === definition.retry &&
    isString(value.message) &&
    isString(value.recoveryInstruction)
  );
}

export function isWriterStatusSnapshot(
  value: unknown,
): value is WriterStatusSnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, SNAPSHOT_KEYS) ||
    !isRecord(value.context) ||
    !hasOnlyKeys(value.context, CONTEXT_KEYS) ||
    !isString(value.context.fileName) ||
    !isString(value.context.pageName) ||
    !isRecord(value.connection) ||
    !hasOnlyKeys(value.connection, CONNECTION_KEYS) ||
    !isString(value.connection.status) ||
    !CONNECTION_STATUSES.has(value.connection.status as ConnectionStatus) ||
    !isString(value.connection.detail) ||
    !isOptionalString(value.connection.endpoint) ||
    !isRecord(value.approval) ||
    !hasOnlyKeys(value.approval, APPROVAL_KEYS) ||
    !isString(value.approval.status) ||
    !APPROVAL_STATUSES.has(value.approval.status as ApprovalStatus) ||
    !isString(value.approval.detail) ||
    !isOptionalString(value.approval.approvalId) ||
    !isOptionalString(value.approval.subject) ||
    !isRecord(value.operation) ||
    !hasOnlyKeys(value.operation, OPERATION_KEYS) ||
    !isString(value.operation.status) ||
    !OPERATION_STATUSES.has(value.operation.status as OperationStatus) ||
    !isString(value.operation.detail) ||
    !isOptionalString(value.operation.operationId) ||
    !isOptionalString(value.operation.step) ||
    !isNonNegativeInteger(value.operation.completedSteps) ||
    !isNonNegativeInteger(value.operation.totalSteps) ||
    value.operation.completedSteps > value.operation.totalSteps ||
    typeof value.writeAuthorized !== "boolean" ||
    (value.error !== null && !isPluginErrorView(value.error))
  ) {
    return false;
  }

  return (
    !value.writeAuthorized ||
    (value.connection.status === "connected" &&
      value.approval.status === "approved")
  );
}

export function isUiToMainMessage(value: unknown): value is UiToMainMessage {
  if (!isRecord(value)) {
    return false;
  }
  if (value.schemaVersion !== FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION) {
    return false;
  }
  if (
    hasOnlyKeys(value, UI_MESSAGE_KEYS) &&
    (value.type === "ui.close" ||
      value.type === "ui.ready" ||
      value.type === "ui.refresh")
  ) {
    return true;
  }
  if (value.type === "file.bind") {
    return (
      hasOnlyKeys(value, FILE_BIND_MESSAGE_KEYS) &&
      value.confirmation === FILE_BINDING_CONFIRMATION &&
      isFigmaLibraryFileBinding(value.binding)
    );
  }
  return (
    value.type === "writer.execute" &&
    hasOnlyKeys(value, EXECUTE_MESSAGE_KEYS) &&
    typeof value.pluginInstanceId === "string" &&
    isWriterCommandDelivery(value.command) &&
    isWriterPluginResult({
      ok: true,
      operationId:
        isRecord(value.command) && typeof value.command.operationId === "string"
          ? value.command.operationId
          : "",
      pluginInstanceId: value.pluginInstanceId,
      result: { pong: true },
      schemaVersion: "1.0.0",
    })
  );
}

export function isMainToUiMessage(value: unknown): value is MainToUiMessage {
  if (
    !isRecord(value) ||
    value.schemaVersion !== FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION
  ) {
    return false;
  }
  if (value.type === "writer.status") {
    return (
      hasOnlyKeys(value, STATUS_MESSAGE_KEYS) &&
      isWriterStatusSnapshot(value.snapshot)
    );
  }
  if (value.type === "writer.context") {
    return (
      hasOnlyKeys(value, CONTEXT_MESSAGE_KEYS) &&
      isRecord(value.context) &&
      hasOnlyKeys(value.context, CONTEXT_KEYS) &&
      isString(value.context.fileName) &&
      isString(value.context.pageName)
    );
  }
  if (value.type === "file.binding") {
    return (
      hasOnlyKeys(value, FILE_BINDING_MESSAGE_KEYS) &&
      (value.binding === null || isFigmaLibraryFileBinding(value.binding)) &&
      (value.error === null || isPluginErrorView(value.error)) &&
      !(value.binding !== null && value.error !== null)
    );
  }
  return (
    value.type === "writer.result" &&
    hasOnlyKeys(value, RESULT_MESSAGE_KEYS) &&
    isWriterPluginResult(value.result)
  );
}
