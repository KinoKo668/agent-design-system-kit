import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  HATCHKIT_VERSION,
  strictSemverSchema,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import { HATCHKIT_MCP_SERVER_VERSION } from "./server.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const RELEASE_TAG = `v${HATCHKIT_VERSION}`;

function text(path: string): string {
  return readFileSync(resolve(WORKSPACE_ROOT, path), "utf8");
}

function packageJson(path: string): {
  private: boolean;
  scripts?: Record<string, string>;
  version: string;
} {
  return JSON.parse(text(path)) as {
    private: boolean;
    scripts?: Record<string, string>;
    version: string;
  };
}

describe("REL-001 release contract", () => {
  it("keeps the source release version synchronized", () => {
    expect(strictSemverSchema.parse(HATCHKIT_VERSION)).toBe(HATCHKIT_VERSION);
    expect(HATCHKIT_MCP_SERVER_VERSION).toBe(HATCHKIT_VERSION);

    for (const path of [
      "package.json",
      "packages/core/package.json",
      "packages/cli/package.json",
      "packages/mcp-server/package.json",
      "packages/figma-plugin/package.json",
    ]) {
      const manifest = packageJson(path);
      expect(manifest.version, path).toBe(HATCHKIT_VERSION);
      expect(manifest.private, path).toBe(true);
    }
  });

  it("publishes an honest, discoverable Alpha boundary", () => {
    const changelog = text("CHANGELOG.md");
    const releaseNotes = text(`docs/REL-001-v${HATCHKIT_VERSION}发布说明.md`);
    const readmes = `${text("README.md")}\n${text("README.zh-CN.md")}`;

    expect(changelog).toContain(`## [${HATCHKIT_VERSION}] - 2026-09-01`);
    expect(changelog).toContain(`[${HATCHKIT_VERSION}]`);
    expect(releaseNotes).toContain(`\`${RELEASE_TAG}\``);
    expect(releaseNotes).toContain("不是生产稳定版");
    expect(releaseNotes).toContain("不是 npm 包发布");
    expect(releaseNotes).toContain("真实 Figma Desktop");
    expect(releaseNotes).toContain("故意不提供可信人工 Approval Record");
    expect(releaseNotes).toContain("尚未暴露为面向 Agent 的公开 MCP Tool");
    expect(readmes).toContain(RELEASE_TAG);
    expect(readmes).toContain(`REL-001-v${HATCHKIT_VERSION}发布说明.md`);
  });

  it("keeps release verification and tag CI executable", () => {
    const root = packageJson("package.json");
    expect(root.scripts?.["release:check"]).toBe(
      "pnpm check && pnpm audit --audit-level=high && ./spikes/run-m0-checks.sh",
    );
    const workflow = text(".github/workflows/quality.yml");
    expect(workflow).toContain('tags:\n      - "v*"');
    expect(workflow).toContain("24.20.0");
    expect(workflow).toContain("22.22.2");
  });

  it("keeps the demo non-authoritative and security reporting private", () => {
    const demoRoot = resolve(WORKSPACE_ROOT, "design-system/hatch-demo");
    const approvalFiles = readdirSync(demoRoot, { recursive: true }).filter(
      (entry) => String(entry).endsWith(".approval.json"),
    );
    expect(approvalFiles).toEqual([]);

    const security = text("SECURITY.md");
    expect(security).toContain(
      "https://github.com/KinoKo668/hatchkit/security/advisories/new",
    );
    expect(security).toContain("Do not disclose");
    expect(text("README.md")).toContain("source available");
    expect(text("README.md")).toContain("PolyForm Noncommercial");
    expect(existsSync(resolve(WORKSPACE_ROOT, "LICENSE.md"))).toBe(true);
    expect(existsSync(resolve(WORKSPACE_ROOT, "COMMERCIAL-LICENSE.md"))).toBe(
      true,
    );
    expect(text(".gitignore")).toContain(".agent-design-system-kit/");
  });
});
