import { describe, expect, it } from "vitest";

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
});
