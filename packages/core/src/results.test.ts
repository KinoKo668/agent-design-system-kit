import { describe, expect, it } from "vitest";

import { createToolkitError } from "./errors.js";
import {
  RESULT_SCHEMA_VERSION,
  createFailureResult,
  createSuccessResult,
  isFailureResult,
  isSuccessResult,
} from "./results.js";

describe("toolkit results", () => {
  it("creates a versioned success envelope with warnings", () => {
    const result = createSuccessResult(
      { componentId: "button", variant: "primary/default" },
      [
        {
          code: "ASSET_UPDATE_AVAILABLE",
          message: "Button 1.1.0 is available.",
          target: {
            logicalId: "ads://kite/component/button",
            type: "component",
            version: "1.0.0",
          },
        },
      ],
    );

    expect(result.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(isSuccessResult(result)).toBe(true);
    expect(isFailureResult(result)).toBe(false);
  });

  it("creates a versioned failure envelope with an actionable error", () => {
    const error = createToolkitError({
      code: "IDENTITY_NOT_FOUND",
      message: "No managed Button component was found.",
      recoveryInstruction:
        "Check the Registry or start the approved asset creation flow.",
      target: {
        logicalId: "ads://kite/component/button",
        type: "component",
      },
    });
    const result = createFailureResult(error);

    expect(result).toEqual({
      error,
      ok: false,
      schemaVersion: "1.0.0",
      warnings: [],
    });
    expect(isFailureResult(result)).toBe(true);
    expect(isSuccessResult(result)).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
