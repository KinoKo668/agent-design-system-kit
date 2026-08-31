import { describe, expect, it } from "vitest";

import {
  createFailureResult,
  createToolkitError,
} from "@agent-design-system-kit/core";

import {
  FIGMA_PLUGIN_PACKAGE_DEPENDENCIES,
  FIGMA_PLUGIN_PACKAGE_NAME,
} from "./index.js";

describe("figma plugin package boundary", () => {
  it("depends only on core", () => {
    expect(FIGMA_PLUGIN_PACKAGE_NAME).toBe(
      "@agent-design-system-kit/figma-plugin",
    );
    expect(FIGMA_PLUGIN_PACKAGE_DEPENDENCIES).toEqual([
      "@agent-design-system-kit/core",
    ]);
  });

  it("consumes the shared failure result contract", () => {
    const result = createFailureResult(
      createToolkitError({
        code: "FILE_BINDING_MISMATCH",
        message: "The open Figma file is not bound to this project.",
        recoveryInstruction: "Open the correct file or explicitly bind it.",
      }),
    );

    expect(result.error.category).toBe("identity");
    expect(result.error.recovery.action).toBe("open_or_bind_correct_file");
  });
});
