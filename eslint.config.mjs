import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "coverage/**",
      "development-tasks/**",
      "diagrams/**",
      "docs/**",
      "spikes/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["packages/**/*.ts", "vitest.config.mts"],
  })),
  {
    files: ["packages/**/*.ts", "vitest.config.mts"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "packages/*/src/*.test.ts",
            "vitest.config.mts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "@agent-design-system-kit/cli",
                "@agent-design-system-kit/mcp-server",
                "@agent-design-system-kit/figma-plugin",
              ],
              message:
                "core 必须保持环境中立，不得依赖 Node、Figma 或入口 Package。",
            },
          ],
        },
      ],
    },
  },
);
