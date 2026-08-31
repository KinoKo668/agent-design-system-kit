import type { ErrorTarget, ToolkitError } from "./errors.js";
import type { JsonObject } from "./json.js";

export const RESULT_SCHEMA_VERSION = "1.0.0" as const;

export interface ResultWarning {
  readonly code: string;
  readonly details?: JsonObject;
  readonly message: string;
  readonly target?: ErrorTarget;
}

interface ResultEnvelope {
  readonly schemaVersion: typeof RESULT_SCHEMA_VERSION;
  readonly warnings: readonly ResultWarning[];
}

export interface SuccessResult<T> extends ResultEnvelope {
  readonly data: T;
  readonly ok: true;
}

export interface FailureResult extends ResultEnvelope {
  readonly error: ToolkitError;
  readonly ok: false;
}

export type ToolkitResult<T> = FailureResult | SuccessResult<T>;

export function createSuccessResult<T>(
  data: T,
  warnings: readonly ResultWarning[] = [],
): SuccessResult<T> {
  return {
    data,
    ok: true,
    schemaVersion: RESULT_SCHEMA_VERSION,
    warnings,
  };
}

export function createFailureResult(
  error: ToolkitError,
  warnings: readonly ResultWarning[] = [],
): FailureResult {
  return {
    error,
    ok: false,
    schemaVersion: RESULT_SCHEMA_VERSION,
    warnings,
  };
}

export function isSuccessResult<T>(
  result: ToolkitResult<T>,
): result is SuccessResult<T> {
  return result.ok;
}

export function isFailureResult<T>(
  result: ToolkitResult<T>,
): result is FailureResult {
  return !result.ok;
}
