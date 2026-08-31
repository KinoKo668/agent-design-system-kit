import { describe, expect, it } from "vitest";

import {
  ERROR_DEFINITIONS,
  createToolkitError,
  getErrorDefinition,
  type ErrorCode,
} from "./errors.js";

const FROZEN_ERROR_CODES = [
  "VALIDATION_FAILED",
  "APPROVAL_REQUIRED",
  "APPROVAL_IN_REVIEW",
  "APPROVAL_CHANGES_REQUESTED",
  "APPROVAL_INCOMPLETE",
  "APPROVAL_REJECTED",
  "APPROVAL_STALE",
  "APPROVAL_SUPERSEDED",
  "APPROVAL_REVOKED",
  "INVALID_STABLE_ID",
  "IDENTITY_NOT_FOUND",
  "IDENTITY_CONFLICT",
  "FILE_BINDING_MISMATCH",
  "UNMANAGED_ASSET",
  "CONTENT_DIGEST_CONFLICT",
  "VERSION_CONFLICT",
  "DOWNGRADE_BLOCKED",
  "SCHEMA_VERSION_UNSUPPORTED",
  "MIGRATION_REQUIRED",
  "MIGRATION_PATH_NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "OPERATION_ID_CONFLICT",
  "PARTIAL_WRITE",
] as const satisfies readonly ErrorCode[];

const SECURITY_ERROR_CODES = [
  "CREDENTIAL_REQUIRED",
  "CREDENTIAL_INVALID",
  "CREDENTIAL_EXPIRED",
  "UNSAFE_CREDENTIAL_SOURCE",
] as const satisfies readonly ErrorCode[];

describe("error definitions", () => {
  it("contains every error code frozen by DIR-002 and ADR-002", () => {
    expect(Object.keys(ERROR_DEFINITIONS)).toEqual(
      expect.arrayContaining([...FROZEN_ERROR_CODES]),
    );
  });

  it("defines a recovery action and retry directive for every code", () => {
    for (const code of Object.keys(ERROR_DEFINITIONS) as ErrorCode[]) {
      const definition = getErrorDefinition(code);

      expect(definition.category).not.toHaveLength(0);
      expect(definition.recoveryAction).not.toHaveLength(0);
      expect(definition.retry).toMatch(
        /^(do_not_retry|retry_after_correction|retry_after_external_change|retry_same_request)$/,
      );
    }
  });

  it("defines fail-closed credential errors in the security category", () => {
    for (const code of SECURITY_ERROR_CODES) {
      expect(getErrorDefinition(code).category).toBe("security");
    }

    expect(getErrorDefinition("UNSAFE_CREDENTIAL_SOURCE")).toEqual({
      category: "security",
      recoveryAction: "move_credential_to_secure_source",
      retry: "do_not_retry",
    });
  });
});

describe("createToolkitError", () => {
  it("adds canonical category, recovery action and retry behavior", () => {
    const error = createToolkitError({
      code: "PARTIAL_WRITE",
      context: {
        actual: { assetVersion: "1.1.0" },
        completedSteps: ["created_component_set", "bound_variables"],
        expected: { assetVersion: "1.2.0" },
      },
      message: "Button update stopped after Figma changed partially.",
      recoveryInstruction:
        "Retry with the same idempotency key after checking the listed steps.",
      target: {
        logicalId: "ads://kite/component/button",
        type: "component",
        version: "1.2.0",
      },
    });

    expect(error).toEqual({
      category: "operation",
      code: "PARTIAL_WRITE",
      context: {
        actual: { assetVersion: "1.1.0" },
        completedSteps: ["created_component_set", "bound_variables"],
        expected: { assetVersion: "1.2.0" },
      },
      message: "Button update stopped after Figma changed partially.",
      recovery: {
        action: "resume_or_recover_operation",
        instruction:
          "Retry with the same idempotency key after checking the listed steps.",
        retry: "retry_same_request",
      },
      target: {
        logicalId: "ads://kite/component/button",
        type: "component",
        version: "1.2.0",
      },
    });
  });

  it("produces a JSON-safe data object without undefined fields", () => {
    const error = createToolkitError({
      code: "APPROVAL_REQUIRED",
      message: "Button has no approval record.",
      recoveryInstruction: "Submit Button 1.0.0 for human review.",
    });

    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
    expect(error).not.toHaveProperty("target");
    expect(error).not.toHaveProperty("context");
  });
});
