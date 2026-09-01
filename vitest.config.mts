import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-design-system-kit/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
