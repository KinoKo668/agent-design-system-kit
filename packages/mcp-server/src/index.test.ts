import { describe, expect, it } from "vitest";

import {
  createFailureResult,
  createToolkitError,
} from "@agent-design-system-kit/core";

import {
  MCP_SERVER_PACKAGE_DEPENDENCIES,
  MCP_SERVER_PACKAGE_NAME,
} from "./index.js";

describe("mcp server package boundary", () => {
  it("depends only on core", () => {
    expect(MCP_SERVER_PACKAGE_NAME).toBe("@agent-design-system-kit/mcp-server");
    expect(MCP_SERVER_PACKAGE_DEPENDENCIES).toEqual([
      "@agent-design-system-kit/core",
    ]);
  });

  it("consumes the shared failure result contract", () => {
    const result = createFailureResult(
      createToolkitError({
        code: "TRANSPORT_UNAVAILABLE",
        message: "The local Figma bridge is unavailable.",
        recoveryInstruction: "Reconnect the plugin and retry the request.",
      }),
    );

    expect(result.error.category).toBe("transport");
    expect(result.error.recovery.retry).toBe("retry_after_external_change");
  });
});
