import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "./index.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const QUICKSTART_PATH = resolve(
  WORKSPACE_ROOT,
  "docs/DOC-001-安装与五分钟Quickstart.md",
);
const CATALOG_ARGUMENTS = [
  "--project",
  "hatch-demo",
  "--root",
  "design-system/hatch-demo",
  "--brief",
  "briefs/hatch-demo.brief.json",
  "--direction-review",
  "directions/hatch-demo.direction-review.json",
  "--token-set",
  "tokens/button-foundation.tokens.json",
  "--component",
  "components/button.component.json",
  "--registry",
  "registry/components.registry.json",
] as const;

function parsedOutput(result: Awaited<ReturnType<typeof runCli>>) {
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.output) as unknown;
}

describe("DOC-001 CLI Quickstart contract", () => {
  it("keeps all three documented Button commands executable", async () => {
    const document = readFileSync(QUICKSTART_PATH, "utf8");
    for (const command of ["validate", "search", "resolve"]) {
      expect(document).toContain(`pnpm --silent hatchkit ${command}`);
    }

    const validation = parsedOutput(
      await runCli(["validate", ...CATALOG_ARGUMENTS], {
        cwd: WORKSPACE_ROOT,
      }),
    );
    expect(validation).toMatchObject({
      data: {
        counts: {
          briefs: 1,
          components: 1,
          directions: 1,
          registries: 1,
          tokenSets: 1,
        },
        projectId: "hatch-demo",
        status: "valid",
      },
      ok: true,
    });

    const search = parsedOutput(
      await runCli(["search", ...CATALOG_ARGUMENTS, "--term", "Button"], {
        cwd: WORKSPACE_ROOT,
      }),
    );
    expect(search).toMatchObject({
      data: {
        items: [
          {
            asset: { id: "button", version: "1.0.0" },
            availability: "figma-ready",
          },
        ],
      },
      ok: true,
    });

    const resolved = parsedOutput(
      await runCli(
        [
          "resolve",
          ...CATALOG_ARGUMENTS,
          "--asset-id",
          "button",
          "--variant",
          "appearance=primary",
          "--variant",
          "state=default",
        ],
        { cwd: WORKSPACE_ROOT },
      ),
    );
    expect(resolved).toMatchObject({
      data: {
        selectedVariant: { id: "appearance-primary/state-default" },
        status: "figma-ready",
      },
      ok: true,
    });
  });
});
