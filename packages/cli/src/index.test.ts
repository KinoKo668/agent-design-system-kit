import { describe, expect, it } from "vitest";

import { CLI_PACKAGE_DEPENDENCIES, CLI_PACKAGE_NAME } from "./index.js";

describe("cli package boundary", () => {
  it("depends only on core", () => {
    expect(CLI_PACKAGE_NAME).toBe("@agent-design-system-kit/cli");
    expect(CLI_PACKAGE_DEPENDENCIES).toEqual(["@agent-design-system-kit/core"]);
  });
});
