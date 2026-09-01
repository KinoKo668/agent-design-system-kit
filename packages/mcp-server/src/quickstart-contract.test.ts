import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFigmaBridgeArguments } from "./figma-bridge-launch.js";
import { parseHatchkitMcpArguments } from "./stdio.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

function text(path: string): string {
  return readFileSync(resolve(WORKSPACE_ROOT, path), "utf8");
}

describe("DOC-001 runtime Quickstart contract", () => {
  it("keeps documented setup, MCP, Bridge, and Plugin facts aligned", () => {
    const document = text("docs/DOC-001-安装与五分钟Quickstart.md");
    const packageJson = JSON.parse(text("package.json")) as {
      packageManager: string;
      scripts: Record<string, string>;
    };
    const manifest = JSON.parse(
      text("packages/figma-plugin/manifest.json"),
    ) as {
      main: string;
      networkAccess: { devAllowedDomains: string[] };
      ui: string;
    };

    expect(text(".nvmrc").trim()).toBe("24.20.0");
    expect(document).toContain("Node.js `24.20.0`");
    expect(packageJson.packageManager).toBe("pnpm@11.24.0");
    expect(document).toContain("pnpm 固定为 `11.24.0`");
    expect(packageJson.scripts["qa:golden"]).toContain(
      "golden-path-regression.test.ts",
    );
    expect(packageJson.scripts["qa:failures"]).toContain(
      "failure-matrix-regression.test.ts",
    );
    expect(document).toContain("pnpm qa:golden");
    expect(document).toContain("pnpm qa:failures");

    expect(
      parseHatchkitMcpArguments([
        "--project",
        "hatch-demo",
        "--root",
        "design-system/hatch-demo",
      ]),
    ).toMatchObject({
      data: {
        designSystemRoot: "design-system/hatch-demo",
        expectedProjectId: "hatch-demo",
        showHelp: false,
      },
      ok: true,
    });
    expect(
      parseFigmaBridgeArguments([
        "--project",
        "hatch-demo",
        "--root",
        "design-system/hatch-demo",
      ]),
    ).toMatchObject({
      data: {
        approvalVerifier: {
          designSystemRoot: "design-system/hatch-demo",
          expectedProjectId: "hatch-demo",
        },
        showHelp: false,
      },
      ok: true,
    });
    expect(parseFigmaBridgeArguments([])).toMatchObject({
      data: { approvalVerifier: null, showHelp: false },
      ok: true,
    });

    expect(manifest).toMatchObject({
      main: "dist/plugin.js",
      networkAccess: {
        devAllowedDomains: ["http://localhost:38451"],
      },
      ui: "dist/ui.html",
    });
    expect(document).toContain("packages/figma-plugin/manifest.json");
    expect(document).toContain("http://127.0.0.1:38451");
    expect(document).toContain("公开 Demo 没有可信人工 Approval Record");

    const codexConfig = text("config/codex-mcp.example.toml");
    expect(codexConfig).toContain('command = "node"');
    expect(codexConfig).toContain('"packages/mcp-server/dist/bin.js"');
    expect(codexConfig).toContain('"hatchkit_status"');
    expect(codexConfig).not.toContain("HATCHKIT_FIGMA_BRIDGE_TOKEN");
  });
});
