import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isFailureResult } from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import { loadExplicitDesignSystem } from "./source-files.js";

async function temporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hatch-cli-"));
}

function expectIssue(
  result: Awaited<ReturnType<typeof loadExplicitDesignSystem>>,
  code: string,
): void {
  expect(isFailureResult(result)).toBe(true);
  if (!isFailureResult(result)) {
    throw new Error("Expected explicit CLI source loading to fail.");
  }
  expect(result.error.context?.details?.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code })]),
  );
}

describe("loadExplicitDesignSystem", () => {
  it("rejects a symbolic-link parent directory", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    try {
      await writeFile(
        join(outside, "button.component.json"),
        JSON.stringify({}),
        "utf8",
      );
      await symlink(outside, join(root, "components"));

      const result = await loadExplicitDesignSystem({
        cwd: root,
        expectedProjectId: "hatch-demo",
        rootPath: ".",
        sources: [
          {
            kind: "component",
            sourcePath: "components/button.component.json",
          },
        ],
      });

      expectIssue(result, "symbolic_link_rejected");
      expect(JSON.stringify(result)).not.toContain(outside);
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("rejects a symbolic-link source file", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    try {
      await mkdir(join(root, "components"));
      const target = join(outside, "button.component.json");
      await writeFile(target, JSON.stringify({}), "utf8");
      await symlink(target, join(root, "components/button.component.json"));

      const result = await loadExplicitDesignSystem({
        cwd: root,
        expectedProjectId: "hatch-demo",
        rootPath: ".",
        sources: [
          {
            kind: "component",
            sourcePath: "components/button.component.json",
          },
        ],
      });

      expectIssue(result, "symbolic_link_rejected");
      expect(JSON.stringify(result)).not.toContain(outside);
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("rejects misleading suffixes before reading a source", async () => {
    const root = await temporaryRoot();
    try {
      const result = await loadExplicitDesignSystem({
        cwd: root,
        expectedProjectId: "hatch-demo",
        rootPath: ".",
        sources: [
          {
            kind: "component",
            sourcePath: "components/button.json",
          },
        ],
      });

      expectIssue(result, "unsupported_file_name");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reports duplicate explicit source paths deterministically", async () => {
    const root = await temporaryRoot();
    try {
      await mkdir(join(root, "tokens"));
      await writeFile(join(root, "tokens/a.tokens.json"), "{}", "utf8");
      const source = {
        kind: "token-set" as const,
        sourcePath: "tokens/a.tokens.json",
      };
      const result = await loadExplicitDesignSystem({
        cwd: root,
        expectedProjectId: "hatch-demo",
        rootPath: ".",
        sources: [source, source],
      });

      expectIssue(result, "duplicate_source_path");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
