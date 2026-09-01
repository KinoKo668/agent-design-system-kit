import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createFailureResult,
  createToolkitError,
} from "@agent-design-system-kit/core";

import {
  CLI_EXIT_CODES,
  CLI_PACKAGE_DEPENDENCIES,
  CLI_PACKAGE_NAME,
  runCli,
} from "./index.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const CATALOG_ARGUMENTS = [
  "--project",
  "hatch-demo",
  "--root",
  "design-system/hatch-demo",
  "--brief",
  "briefs/hatch-demo.brief.json",
  "--token-set",
  "tokens/button-foundation.tokens.json",
  "--component",
  "components/button.component.json",
  "--registry",
  "registry/components.registry.json",
] as const;

function parseOutput(result: Awaited<ReturnType<typeof runCli>>): unknown {
  return JSON.parse(result.output) as unknown;
}

describe("cli package boundary", () => {
  it("depends only on core", () => {
    expect(CLI_PACKAGE_NAME).toBe("@agent-design-system-kit/cli");
    expect(CLI_PACKAGE_DEPENDENCIES).toEqual(["@agent-design-system-kit/core"]);
  });

  it("consumes the shared failure result contract", () => {
    const result = createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The command input is invalid.",
        recoveryInstruction: "Fix the reported input fields and try again.",
      }),
    );

    expect(result.error.category).toBe("validation");
    expect(result.schemaVersion).toBe("1.0.0");
  });
});

describe("runCli", () => {
  it("prints help without reading project files", async () => {
    const result = await runCli(["--help"], { cwd: WORKSPACE_ROOT });

    expect(result.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(result.output).toContain("hatchkit request-change");
    expect(result.output).toContain("No command writes");
  });

  it("validates the complete public catalog with source-relative output", async () => {
    const result = await runCli(["validate", ...CATALOG_ARGUMENTS], {
      cwd: WORKSPACE_ROOT,
    });

    expect(result.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(result)).toMatchObject({
      ok: true,
      data: {
        counts: {
          briefs: 1,
          components: 1,
          registries: 1,
          tokenSets: 1,
        },
        projectId: "hatch-demo",
        status: "valid",
      },
    });
    expect(result.output).not.toContain(WORKSPACE_ROOT);
  });

  it("searches exact component facts through Core", async () => {
    const result = await runCli(
      ["search", ...CATALOG_ARGUMENTS, "--term", "Button"],
      { cwd: WORKSPACE_ROOT },
    );

    expect(result.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(result)).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            asset: { id: "button", version: "1.0.0" },
            availability: "figma-ready",
            matchFields: ["assetId", "name"],
          },
        ],
        total: 1,
      },
    });
  });

  it("resolves an exact Variant and preserves approval/audit warnings", async () => {
    const result = await runCli(
      [
        "resolve",
        ...CATALOG_ARGUMENTS,
        "--asset-id",
        "button",
        "--variant",
        "appearance=secondary",
        "--variant",
        "state=disabled",
      ],
      { cwd: WORKSPACE_ROOT },
    );

    expect(result.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(result)).toMatchObject({
      ok: true,
      data: {
        selectedVariant: {
          id: "appearance-secondary/state-disabled",
        },
        status: "figma-ready",
      },
      warnings: [
        { code: "APPROVAL_GUARD_REQUIRED" },
        { code: "FIGMA_AUDIT_REQUIRED" },
      ],
    });
  });

  it("creates a deterministic Change Request instead of a tertiary approximation", async () => {
    const args = [
      "request-change",
      ...CATALOG_ARGUMENTS,
      "--asset-id",
      "button",
      "--variant",
      "appearance=tertiary",
      "--request-id",
      "00000000-0000-4000-8000-000000000020",
      "--submitted-at",
      "2026-09-01T16:30:00Z",
      "--submitted-by",
      "codex",
      "--summary",
      "Add a tertiary Button appearance",
      "--rationale",
      "The approved Button does not contain the required low-emphasis appearance.",
      "--intended-use",
      "Use it for the low-emphasis action in a settings footer.",
    ] as const;
    const first = await runCli(args, { cwd: WORKSPACE_ROOT });
    const second = await runCli(args, { cwd: WORKSPACE_ROOT });

    expect(first).toEqual(second);
    expect(first.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(first)).toMatchObject({
      ok: true,
      data: {
        changeRequest: {
          changeKind: "extend-component",
          prohibitedActions: [
            "create-visual-approximation",
            "fallback-to-inactive-component",
            "invent-unregistered-property-or-variant",
            "enqueue-figma-write",
          ],
          requestId: "00000000-0000-4000-8000-000000000020",
        },
        outcome: "change-request-required",
      },
    });
    expect(first.output).not.toContain("componentSetKey");
    expect(first.output).not.toContain("nodeId");
  });

  it("uses stable JSON and exit 2 for command usage failures", async () => {
    const result = await runCli(["resolve", "--asset-id", "button"], {
      cwd: WORKSPACE_ROOT,
    });

    expect(result.exitCode).toBe(CLI_EXIT_CODES.usageFailure);
    expect(parseOutput(result)).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        target: { type: "command" },
      },
    });
  });

  it("rejects traversal before reading and never exposes the absolute root", async () => {
    const result = await runCli(
      [
        "validate",
        "--project",
        "hatch-demo",
        "--root",
        "design-system/hatch-demo",
        "--component",
        "../components/button.component.json",
      ],
      { cwd: WORKSPACE_ROOT },
    );

    expect(result.exitCode).toBe(CLI_EXIT_CODES.commandFailure);
    expect(parseOutput(result)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(result.output).toContain("unsafe_source_path");
    expect(result.output).not.toContain(WORKSPACE_ROOT);
  });
});
