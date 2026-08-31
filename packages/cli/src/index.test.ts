import { describe, expect, it } from "vitest";

import {
  createFailureResult,
  createToolkitError,
} from "@agent-design-system-kit/core";

import { CLI_PACKAGE_DEPENDENCIES, CLI_PACKAGE_NAME } from "./index.js";

describe("cli package boundary", () => {
  it("depends only on core", () => {
    expect(CLI_PACKAGE_NAME).toBe("@agent-design-system-kit/cli");
    expect(CLI_PACKAGE_DEPENDENCIES).toEqual(["@agent-design-system-kit/core"]);
  });

  it("consumes the shared failure result contract", () => {
    const result = createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The command input is invalid.",
        recoveryInstruction: "Fix the reported input fields and try again.",
      }),
    );

    expect(result.error.category).toBe("validation");
    expect(result.schemaVersion).toBe("1.0.0");
  });
});
