import type { JsonObject } from "./json.js";

export type ErrorCategory =
  | "approval"
  | "identity"
  | "internal"
  | "migration"
  | "operation"
  | "transport"
  | "validation"
  | "version";

export type RetryDirective =
  | "do_not_retry"
  | "retry_after_correction"
  | "retry_after_external_change"
  | "retry_same_request";

export interface ErrorDefinition {
  readonly category: ErrorCategory;
  readonly recoveryAction: string;
  readonly retry: RetryDirective;
}

export const ERROR_DEFINITIONS = {
  VALIDATION_FAILED: {
    category: "validation",
    recoveryAction: "fix_validation_errors",
    retry: "retry_after_correction",
  },
  APPROVAL_REQUIRED: {
    category: "approval",
    recoveryAction: "submit_for_review",
    retry: "retry_after_external_change",
  },
  APPROVAL_IN_REVIEW: {
    category: "approval",
    recoveryAction: "wait_for_approval",
    retry: "retry_after_external_change",
  },
  APPROVAL_CHANGES_REQUESTED: {
    category: "approval",
    recoveryAction: "create_revised_version",
    retry: "retry_after_correction",
  },
  APPROVAL_INCOMPLETE: {
    category: "approval",
    recoveryAction: "request_missing_approvals",
    retry: "retry_after_external_change",
  },
  APPROVAL_REJECTED: {
    category: "approval",
    recoveryAction: "create_new_version",
    retry: "do_not_retry",
  },
  APPROVAL_STALE: {
    category: "approval",
    recoveryAction: "resubmit_current_content",
    retry: "retry_after_correction",
  },
  APPROVAL_SUPERSEDED: {
    category: "approval",
    recoveryAction: "use_latest_approved_version",
    retry: "retry_after_correction",
  },
  APPROVAL_REVOKED: {
    category: "approval",
    recoveryAction: "stop_use_and_assess_impact",
    retry: "do_not_retry",
  },
  INVALID_STABLE_ID: {
    category: "identity",
    recoveryAction: "fix_stable_id",
    retry: "retry_after_correction",
  },
  IDENTITY_NOT_FOUND: {
    category: "identity",
    recoveryAction: "locate_or_create_asset",
    retry: "retry_after_correction",
  },
  IDENTITY_CONFLICT: {
    category: "identity",
    recoveryAction: "resolve_identity_conflict",
    retry: "do_not_retry",
  },
  FILE_BINDING_MISMATCH: {
    category: "identity",
    recoveryAction: "open_or_bind_correct_file",
    retry: "retry_after_correction",
  },
  UNMANAGED_ASSET: {
    category: "identity",
    recoveryAction: "run_asset_adoption",
    retry: "retry_after_correction",
  },
  CONTENT_DIGEST_CONFLICT: {
    category: "version",
    recoveryAction: "create_new_version_and_review",
    retry: "retry_after_correction",
  },
  VERSION_CONFLICT: {
    category: "version",
    recoveryAction: "refresh_target_version",
    retry: "retry_after_correction",
  },
  DOWNGRADE_BLOCKED: {
    category: "version",
    recoveryAction: "create_rollback_plan",
    retry: "do_not_retry",
  },
  SCHEMA_VERSION_UNSUPPORTED: {
    category: "version",
    recoveryAction: "upgrade_or_migrate_schema",
    retry: "retry_after_correction",
  },
  MIGRATION_REQUIRED: {
    category: "migration",
    recoveryAction: "run_approved_migration",
    retry: "retry_after_correction",
  },
  MIGRATION_PATH_NOT_FOUND: {
    category: "migration",
    recoveryAction: "implement_migration_path",
    retry: "do_not_retry",
  },
  IDEMPOTENCY_CONFLICT: {
    category: "operation",
    recoveryAction: "reuse_original_or_new_idempotency_key",
    retry: "retry_after_correction",
  },
  OPERATION_ID_CONFLICT: {
    category: "operation",
    recoveryAction: "reuse_original_or_new_operation_id",
    retry: "retry_after_correction",
  },
  PARTIAL_WRITE: {
    category: "operation",
    recoveryAction: "resume_or_recover_operation",
    retry: "retry_same_request",
  },
  TRANSPORT_UNAVAILABLE: {
    category: "transport",
    recoveryAction: "restore_connection",
    retry: "retry_after_external_change",
  },
  OPERATION_TIMEOUT: {
    category: "transport",
    recoveryAction: "inspect_then_retry_same_request",
    retry: "retry_same_request",
  },
  INTERNAL_ERROR: {
    category: "internal",
    recoveryAction: "report_internal_error",
    retry: "do_not_retry",
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export type RecoveryAction =
  (typeof ERROR_DEFINITIONS)[ErrorCode]["recoveryAction"];

export type ErrorTargetType =
  | "approval"
  | "brief"
  | "command"
  | "component"
  | "direction"
  | "figma-asset"
  | "figma-file"
  | "operation"
  | "project"
  | "registry"
  | "schema"
  | "token"
  | "token-set";

export interface ErrorTarget {
  readonly type: ErrorTargetType;
  readonly logicalId: string;
  readonly version?: string;
}

export interface ErrorContext {
  readonly actual?: JsonObject;
  readonly completedSteps?: readonly string[];
  readonly details?: JsonObject;
  readonly expected?: JsonObject;
  readonly missingConditions?: readonly string[];
}

export interface ErrorRecovery {
  readonly action: RecoveryAction;
  readonly instruction: string;
  readonly retry: RetryDirective;
}

export interface ToolkitError {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly context?: ErrorContext;
  readonly message: string;
  readonly recovery: ErrorRecovery;
  readonly target?: ErrorTarget;
}

export interface CreateToolkitErrorInput {
  readonly code: ErrorCode;
  readonly context?: ErrorContext;
  readonly message: string;
  readonly recoveryInstruction: string;
  readonly target?: ErrorTarget;
}

export function getErrorDefinition<const Code extends ErrorCode>(
  code: Code,
): (typeof ERROR_DEFINITIONS)[Code] {
  return ERROR_DEFINITIONS[code];
}

export function createToolkitError(
  input: CreateToolkitErrorInput,
): ToolkitError {
  const definition = getErrorDefinition(input.code);

  return {
    category: definition.category,
    code: input.code,
    message: input.message,
    recovery: {
      action: definition.recoveryAction,
      instruction: input.recoveryInstruction,
      retry: definition.retry,
    },
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(input.target === undefined ? {} : { target: input.target }),
  };
}
