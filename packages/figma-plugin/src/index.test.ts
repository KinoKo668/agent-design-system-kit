import { describe, expect, it } from "vitest";

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
});
