import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  CORE_PACKAGE_NAME,
  ERROR_DEFINITIONS,
  WRITER_COMMAND_TYPES,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import {
  FIGMA_BRIDGE_DEFAULT_PORT,
  FIGMA_BRIDGE_DEFAULT_SESSION_TTL_MS,
  FIGMA_BRIDGE_HOST,
} from "./figma-bridge.js";
import { OPERATION_LOG_RETENTION_DAYS } from "./operation-log.js";
import {
  HATCHKIT_BRIEF_QUERY_TOOL_NAME,
  HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
  HATCHKIT_TOKEN_QUERY_TOOL_NAME,
} from "./query-tools.js";
import {
  HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
  HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
} from "./resolution-tools.js";
import { HATCHKIT_STATUS_TOOL_NAME } from "./server.js";
import {
  HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
  HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
  HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
  HATCHKIT_STYLE_AUDIT_TOOL_NAME,
} from "./write-tools.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const TROUBLESHOOTING_PATH = resolve(
  WORKSPACE_ROOT,
  "docs/DOC-002-故障排查手册.md",
);
const ARCHITECTURE_PATH = resolve(
  WORKSPACE_ROOT,
  "docs/DOC-002-当前架构与运行边界.md",
);

function text(path: string): string {
  return readFileSync(resolve(WORKSPACE_ROOT, path), "utf8");
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(text(path)) as Record<string, unknown>;
}

function expectLocalMarkdownLinksToExist(path: string): void {
  const document = readFileSync(path, "utf8");
  const links = document.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu);
  for (const match of links) {
    const target = match[1];
    if (
      target === undefined ||
      target.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/iu.test(target)
    ) {
      continue;
    }
    const fileTarget = target.split("#", 1)[0];
    expect(fileTarget, `Empty local link in ${path}`).toBeTruthy();
    expect(
      existsSync(resolve(dirname(path), decodeURIComponent(fileTarget ?? ""))),
      `Missing local link '${target}' in ${path}`,
    ).toBe(true);
  }
}

describe("DOC-002 documentation contracts", () => {
  it("documents every shared Core error with exact recovery metadata", () => {
    const document = readFileSync(TROUBLESHOOTING_PATH, "utf8");
    const entries = Object.entries(ERROR_DEFINITIONS);
    const normalizedRows = document
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .map((line) =>
        line
          .split("|")
          .map((cell) => cell.trim())
          .join("|"),
      );

    expect(entries).toHaveLength(30);
    for (const [code, definition] of entries) {
      expect(normalizedRows).toContain(
        `|\`${code}\`|\`${definition.category}\`|\`${definition.recoveryAction}\`|\`${definition.retry}\`|`,
      );
    }
    for (const retry of [
      "do_not_retry",
      "retry_after_correction",
      "retry_after_external_change",
      "retry_same_request",
    ]) {
      expect(document).toContain(`\`${retry}\``);
    }
    expect(document).toContain(".agent-design-system-kit/runtime/operations/");
    expect(document).toContain(
      `保留 ${String(OPERATION_LOG_RETENTION_DAYS)} 天`,
    );
  });

  it("keeps the current runtime architecture aligned with public contracts", () => {
    const document = readFileSync(ARCHITECTURE_PATH, "utf8");
    const toolNames = [
      HATCHKIT_STATUS_TOOL_NAME,
      HATCHKIT_BRIEF_QUERY_TOOL_NAME,
      HATCHKIT_TOKEN_QUERY_TOOL_NAME,
      HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
      HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME,
      HATCHKIT_COMPONENT_CHANGE_REQUEST_TOOL_NAME,
      HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
      HATCHKIT_STYLE_AUDIT_TOOL_NAME,
      HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
      HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
    ];
    for (const toolName of toolNames) expect(document).toContain(toolName);
    for (const commandType of Object.values(WRITER_COMMAND_TYPES)) {
      expect(document).toContain(`\`${commandType}\``);
    }

    expect(FIGMA_BRIDGE_HOST).toBe("127.0.0.1");
    expect(document).toContain(
      `HTTP \`${FIGMA_BRIDGE_HOST}:${String(FIGMA_BRIDGE_DEFAULT_PORT)}\``,
    );
    expect(FIGMA_BRIDGE_DEFAULT_SESSION_TTL_MS).toBe(8 * 60 * 60 * 1_000);
    expect(document).toContain("默认八小时");
  });

  it("keeps package dependencies one-way toward Core", () => {
    const core = json("packages/core/package.json");
    const coreDependencies = core.dependencies as Record<string, string>;
    expect(
      Object.keys(coreDependencies).filter((name) =>
        name.startsWith("@agent-design-system-kit/"),
      ),
    ).toEqual([]);

    for (const packageName of ["cli", "mcp-server", "figma-plugin"]) {
      const packageJson = json(`packages/${packageName}/package.json`);
      const dependencies = packageJson.dependencies as Record<string, string>;
      expect(dependencies[CORE_PACKAGE_NAME]).toBe("workspace:*");
      expect(
        Object.keys(dependencies).filter(
          (name) =>
            name.startsWith("@agent-design-system-kit/") &&
            name !== CORE_PACKAGE_NAME,
        ),
      ).toEqual([]);
    }
  });

  it("keeps DOC-002 discoverable and all of its local links valid", () => {
    const troubleshootingName = "DOC-002-故障排查手册.md";
    const architectureName = "DOC-002-当前架构与运行边界.md";
    for (const entrypoint of [
      text("README.md"),
      text("README.zh-CN.md"),
      text("docs/DOC-001-安装与五分钟Quickstart.md"),
    ]) {
      expect(entrypoint).toContain(troubleshootingName);
      expect(entrypoint).toContain(architectureName);
    }
    expectLocalMarkdownLinksToExist(TROUBLESHOOTING_PATH);
    expectLocalMarkdownLinksToExist(ARCHITECTURE_PATH);
  });
});
