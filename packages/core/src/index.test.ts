import { describe, expect, it } from "vitest";

import {
  CORE_PACKAGE_NAME,
  DESIGN_BRIEF_ASSET_TYPE,
  DESIGN_BRIEF_SCHEMA_VERSION,
  DTCG_VERSION,
  LOG_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION,
  TOKEN_SET_ASSET_TYPE,
  TOKEN_SET_SCHEMA_VERSION,
  createLogEvent,
  createSuccessResult,
  createToolkitError,
  redactSensitiveText,
} from "./index.js";

describe("core package boundary", () => {
  it("exposes its stable package identity", () => {
    expect(CORE_PACKAGE_NAME).toBe("@agent-design-system-kit/core");
    expect(DESIGN_BRIEF_SCHEMA_VERSION).toBe("1.0.0");
    expect(DESIGN_BRIEF_ASSET_TYPE).toBe("brief");
    expect(TOKEN_SET_SCHEMA_VERSION).toBe("1.0.0");
    expect(TOKEN_SET_ASSET_TYPE).toBe("token-set");
    expect(DTCG_VERSION).toBe("2025.10");
  });

  it("exposes the shared result contract from its public entry point", () => {
    expect(createSuccessResult({ ready: true })).toEqual({
      data: { ready: true },
      ok: true,
      schemaVersion: RESULT_SCHEMA_VERSION,
      warnings: [],
    });
  });

  it("exposes shared errors and logs from its public entry point", () => {
    const error = createToolkitError({
      code: "INTERNAL_ERROR",
      message: "The package self-check failed.",
      recoveryInstruction: "Report the failure to the toolkit maintainer.",
    });
    const event = createLogEvent({
      error,
      event: "core.self_check_failed",
      level: "error",
      message: "The core self-check failed.",
      sensitiveValues: [],
      source: "core",
      timestamp: "2026-08-31T12:00:00.000Z",
    });

    expect(event.schemaVersion).toBe(LOG_SCHEMA_VERSION);
    expect(event.error).toEqual({
      category: "internal",
      code: "INTERNAL_ERROR",
    });
    expect(
      redactSensitiveText("Authorization: Bearer private-value", {
        sensitiveValues: ["private-value"],
      }),
    ).toBe("Authorization: Bearer [REDACTED]");
  });
});
