import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HATCHKIT_VERSION,
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
  "--direction-review",
  "directions/hatch-demo.direction-review.json",
  "--token-set",
  "tokens/button-foundation.tokens.json",
  "--component",
  "components/button.component.json",
  "--registry",
  "registry/components.registry.json",
] as const;
const ICON_CATALOG_ARGUMENTS = [
  "--project",
  "hatch-demo",
  "--root",
  "design-system/hatch-demo",
  "--token-set",
  "tokens/icon-foundation.tokens.json",
  "--component",
  "components/icon-check.component.json",
  "--registry",
  "registry/icons.registry.json",
] as const;
const INPUT_CATALOG_ARGUMENTS = [
  "--project",
  "hatch-demo",
  "--root",
  "design-system/hatch-demo",
  "--token-set",
  "tokens/input-foundation.tokens.json",
  "--component",
  "components/input-text.component.json",
  "--registry",
  "registry/inputs.registry.json",
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
  it("prints the release version without reading project files", async () => {
    const long = await runCli(["--version"], { cwd: WORKSPACE_ROOT });
    const short = await runCli(["-v"], { cwd: WORKSPACE_ROOT });

    expect(long).toEqual({
      exitCode: CLI_EXIT_CODES.success,
      output: `${HATCHKIT_VERSION}\n`,
    });
    expect(short).toEqual(long);
  });

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
          directions: 1,
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

  it("searches and resolves the exact unbuilt Icon Contract", async () => {
    const search = await runCli(
      ["search", ...ICON_CATALOG_ARGUMENTS, "--term", "Icon / Check"],
      { cwd: WORKSPACE_ROOT },
    );
    const resolved = await runCli(
      [
        "resolve",
        ...ICON_CATALOG_ARGUMENTS,
        "--asset-id",
        "icon/check",
        "--variant",
        "size=large",
      ],
      { cwd: WORKSPACE_ROOT },
    );

    expect(search.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(search)).toMatchObject({
      data: {
        items: [
          {
            asset: { id: "icon/check", version: "1.0.0" },
            availability: "ensure-required",
            profile: "icon-v1",
          },
        ],
      },
      ok: true,
    });
    expect(resolved.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(resolved)).toMatchObject({
      data: {
        selectedVariant: { id: "size-large" },
        status: "ensure-required",
        variantSelections: { size: "large" },
      },
      ok: true,
    });
  });

  it("searches and resolves the exact unbuilt Input Contract", async () => {
    const search = await runCli(
      ["search", ...INPUT_CATALOG_ARGUMENTS, "--term", "Input / Text"],
      { cwd: WORKSPACE_ROOT },
    );
    const resolved = await runCli(
      [
        "resolve",
        ...INPUT_CATALOG_ARGUMENTS,
        "--asset-id",
        "input/text",
        "--variant",
        "state=error",
        "--variant",
        "content=filled",
      ],
      { cwd: WORKSPACE_ROOT },
    );

    expect(search.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(search)).toMatchObject({
      data: {
        items: [
          {
            asset: { id: "input/text", version: "1.0.0" },
            availability: "ensure-required",
            profile: "input-v1",
          },
        ],
      },
      ok: true,
    });
    expect(resolved.exitCode).toBe(CLI_EXIT_CODES.success);
    expect(parseOutput(resolved)).toMatchObject({
      data: {
        selectedVariant: { id: "state-error/content-filled" },
        status: "ensure-required",
        variantSelections: { content: "filled", state: "error" },
      },
      ok: true,
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
