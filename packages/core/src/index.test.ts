import { describe, expect, it } from "vitest";

import { CORE_PACKAGE_NAME } from "./index.js";

describe("core package boundary", () => {
  it("exposes its stable package identity", () => {
    expect(CORE_PACKAGE_NAME).toBe("@agent-design-system-kit/core");
  });
});
