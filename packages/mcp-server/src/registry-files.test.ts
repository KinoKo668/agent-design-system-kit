import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  isFailureResult,
  isSuccessResult,
  toButtonComponentContractDigestSubject,
  validateButtonComponentContract,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import validBrief from "../../../design-system/hatch-demo/briefs/hatch-demo.brief.json" with { type: "json" };
import validButtonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  computeJsonContentDigest,
  loadDesignSystemFromDirectory,
} from "./registry-files.js";

async function createTemporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hatch-registry-"));
}

async function writeJson(
  root: string,
  sourcePath: string,
  value: unknown,
): Promise<void> {
  const absolutePath = join(root, ...sourcePath.split("/"));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function registryWithDigest(digest: string): unknown {
  const entry = validRegistry.entries[0];
  if (entry === undefined) {
    throw new Error("Expected the valid Registry fixture.");
  }
  return {
    ...validRegistry,
    entries: [
      {
        ...entry,
        asset: { ...entry.asset, contentDigest: digest },
        figma: { ...entry.figma, appliedDigest: digest },
      },
    ],
  };
}

async function writeValidDesignSystem(root: string): Promise<string> {
  const contractResult = validateButtonComponentContract(validButtonContract);
  if (!isSuccessResult(contractResult)) {
    throw new Error("Expected the valid Button Contract fixture.");
  }
  const digest = computeJsonContentDigest(
    toButtonComponentContractDigestSubject(contractResult.data),
  );
  await Promise.all([
    writeJson(root, "briefs/product.brief.json", validBrief),
    writeJson(root, "tokens/foundation.tokens.json", validTokenSet),
    writeJson(root, "components/button.component.json", {
      ...validButtonContract,
      contentDigest: digest,
    }),
    writeJson(
      root,
      "registry/components.registry.json",
      registryWithDigest(digest),
    ),
  ]);
  return digest;
}

async function removeTemporaryRoot(root: string): Promise<void> {
  await rm(root, { force: true, recursive: true });
}

function expectIntegrityIssue(
  result: Awaited<ReturnType<typeof loadDesignSystemFromDirectory>>,
  expected: Record<string, unknown>,
): void {
  expect(isFailureResult(result)).toBe(true);
  if (!isFailureResult(result)) {
    throw new Error("Expected local design-system loading to fail.");
  }
  expect(result.error.context?.details?.issues).toEqual(
    expect.arrayContaining([expect.objectContaining(expected)]),
  );
}

describe("loadDesignSystemFromDirectory", () => {
  it("discovers, parses and verifies canonical design-system files", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeValidDesignSystem(root);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expect(isSuccessResult(result)).toBe(true);
      if (!isSuccessResult(result)) {
        throw new Error("Expected a valid local design-system snapshot.");
      }
      expect(result.data).toMatchObject({
        projectId: "hatch-demo",
        briefs: [{ sourcePath: "briefs/product.brief.json" }],
        tokenSets: [{ sourcePath: "tokens/foundation.tokens.json" }],
        components: [{ sourcePath: "components/button.component.json" }],
        registries: [{ sourcePath: "registry/components.registry.json" }],
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("returns the relative source path for malformed JSON", async () => {
    const root = await createTemporaryRoot();
    try {
      await mkdir(join(root, "tokens"), { recursive: true });
      await writeFile(
        join(root, "tokens", "broken.tokens.json"),
        '{"schemaVersion":',
        "utf8",
      );

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "invalid_json",
        path: "/",
        sourcePath: "tokens/broken.tokens.json",
      });
      expect(JSON.stringify(result)).not.toContain(root);
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("rejects JSON files with a misleading managed filename", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeJson(root, "components/button.json", validButtonContract);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "unsupported_file_name",
        sourcePath: "components/button.json",
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("rejects symbolic links inside managed directories", async () => {
    const root = await createTemporaryRoot();
    try {
      await mkdir(join(root, "components"), { recursive: true });
      const target = join(root, "outside.component.json");
      await writeFile(target, JSON.stringify(validButtonContract), "utf8");
      await symlink(target, join(root, "components", "linked.component.json"));

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "symbolic_link_rejected",
        sourcePath: "components/linked.component.json",
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("verifies the stored Contract digest against canonical content", async () => {
    const root = await createTemporaryRoot();
    try {
      const digest = await writeValidDesignSystem(root);
      const tamperedContract = {
        ...validButtonContract,
        description: "Tampered after digest creation.",
        contentDigest: digest,
      };
      await writeJson(
        root,
        "components/button.component.json",
        tamperedContract,
      );

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "content_digest_mismatch",
        path: "/contentDigest",
        sourcePath: "components/button.component.json",
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("enforces the configured file-size limit", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeJson(root, "briefs/product.brief.json", validBrief);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
        maxFileBytes: 32,
      });

      expectIntegrityIssue(result, {
        code: "file_size_exceeded",
        sourcePath: "briefs/product.brief.json",
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("distinguishes a missing design-system root from invalid content", async () => {
    const root = join(tmpdir(), `missing-hatch-registry-${String(Date.now())}`);

    const result = await loadDesignSystemFromDirectory({
      designSystemRoot: root,
      expectedProjectId: "hatch-demo",
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the missing root to fail.");
    }
    expect(result.error).toMatchObject({ code: "IDENTITY_NOT_FOUND" });
  });

  it("rejects a regular file used as the design-system root", async () => {
    const root = await createTemporaryRoot();
    const file = join(root, "not-a-directory.json");
    try {
      await writeFile(file, "{}", "utf8");

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: file,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "managed_root_not_directory",
        sourcePath: ".",
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });
});
