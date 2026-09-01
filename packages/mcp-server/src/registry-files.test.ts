import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  approvalRecordSchema,
  isFailureResult,
  isSuccessResult,
  toButtonComponentContractDigestSubject,
  toDesignBriefDigestSubject,
  toTokenSetDigestSubject,
  validateButtonComponentContract,
  validateDesignBrief,
  validateTokenSet,
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

function approvalFixtureData() {
  const briefResult = validateDesignBrief(validBrief);
  const tokenResult = validateTokenSet(validTokenSet);
  if (!briefResult.ok || !tokenResult.ok) {
    throw new Error("Expected valid Brief and Token fixtures.");
  }
  const briefDigest = computeJsonContentDigest(
    toDesignBriefDigestSubject(briefResult.data),
  );
  const tokenDigest = computeJsonContentDigest(
    toTokenSetDigestSubject(tokenResult.data),
  );
  const directionDigest = `sha256:${"d".repeat(64)}`;
  const commonValidation = {
    evidence: "artifacts://validation/schema.json",
    priority: "P0",
    status: "passed",
    validatedAt: "2026-09-01T12:05:00Z",
  } as const;
  const directionApproval = approvalRecordSchema.parse({
    approvalId: "approval.direction.precise-friendly.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:20:00Z",
        decision: "approved",
        reviewer: "github:product-reviewer",
        role: "product_owner",
        summary: "The direction fits the product and brand intent.",
      },
      {
        decidedAt: "2026-09-01T12:21:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "The direction is coherent and extensible.",
      },
    ],
    dependencies: [
      {
        approvalId: null,
        assetId: briefResult.data.assetId,
        assetVersion: briefResult.data.assetVersion,
        contentDigest: briefDigest,
        projectId: "hatch-demo",
        type: "brief",
      },
    ],
    evidence: [
      { kind: "image", uri: "artifacts://review/direction-preview.png" },
    ],
    policy: {
      requiredRoles: ["product_owner", "design_owner"],
      requiredValidationChecks: ["schema", "visual-review"],
    },
    schemaVersion: "1.0.0",
    status: "approved",
    subject: {
      assetId: "precise-friendly",
      assetVersion: "1.0.0",
      contentDigest: directionDigest,
      gitCommit: "c".repeat(40),
      projectId: "hatch-demo",
      type: "direction",
    },
    submission: {
      submittedAt: "2026-09-01T12:00:00Z",
      submittedBy: "agent:codex",
    },
    supersedes: null,
    termination: null,
    validations: [
      { ...commonValidation, check: "schema" },
      {
        ...commonValidation,
        check: "visual-review",
        evidence: "artifacts://validation/direction-visual-review.json",
      },
    ],
  });
  const tokenApproval = approvalRecordSchema.parse({
    approvalId: "approval.tokens.button-foundation.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:30:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "Token semantics and visual results are approved.",
      },
      {
        decidedAt: "2026-09-01T12:31:00Z",
        decision: "approved",
        reviewer: "github:technical-reviewer",
        role: "technical_owner",
        summary: "Token schema, aliases, and versioning are approved.",
      },
    ],
    dependencies: [
      {
        approvalId: directionApproval.approvalId,
        assetId: directionApproval.subject.assetId,
        assetVersion: directionApproval.subject.assetVersion,
        contentDigest: directionApproval.subject.contentDigest,
        projectId: "hatch-demo",
        type: "direction",
      },
    ],
    evidence: [
      { kind: "report", uri: "artifacts://review/token-preview.json" },
    ],
    policy: {
      requiredRoles: ["design_owner", "technical_owner"],
      requiredValidationChecks: [
        "schema",
        "token-references",
        "color-contrast",
      ],
    },
    schemaVersion: "1.0.0",
    status: "approved",
    subject: {
      assetId: tokenResult.data.assetId,
      assetVersion: tokenResult.data.assetVersion,
      contentDigest: tokenDigest,
      gitCommit: "c".repeat(40),
      projectId: "hatch-demo",
      type: "token-set",
    },
    submission: {
      submittedAt: "2026-09-01T12:00:00Z",
      submittedBy: "agent:codex",
    },
    supersedes: null,
    termination: null,
    validations: [
      { ...commonValidation, check: "schema" },
      {
        ...commonValidation,
        check: "token-references",
        evidence: "artifacts://validation/token-references.json",
      },
      {
        ...commonValidation,
        check: "color-contrast",
        evidence: "artifacts://validation/color-contrast.json",
      },
    ],
  });
  return { directionApproval, tokenApproval };
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
        approvals: [],
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

  it("loads Approval Records and verifies their subject and dependency digests", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeValidDesignSystem(root);
      const { directionApproval, tokenApproval } = approvalFixtureData();
      await Promise.all([
        writeJson(
          root,
          "approvals/directions/precise-friendly/1.0.0.approval.json",
          directionApproval,
        ),
        writeJson(
          root,
          "approvals/tokens/button-foundation/1.0.0.approval.json",
          tokenApproval,
        ),
      ]);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expect(result).toMatchObject({
        data: {
          approvals: [
            {
              data: { approvalId: directionApproval.approvalId },
              sourcePath:
                "approvals/directions/precise-friendly/1.0.0.approval.json",
            },
            {
              data: { approvalId: tokenApproval.approvalId },
              sourcePath:
                "approvals/tokens/button-foundation/1.0.0.approval.json",
            },
          ],
        },
        ok: true,
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("accepts reciprocal lineage from a superseded Approval to its approved replacement", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeValidDesignSystem(root);
      const { directionApproval } = approvalFixtureData();
      const replacement = approvalRecordSchema.parse({
        ...directionApproval,
        approvalId: "approval.direction.precise-friendly.2.0.0",
        subject: {
          ...directionApproval.subject,
          assetVersion: "2.0.0",
        },
        supersedes: directionApproval.approvalId,
      });
      const predecessor = approvalRecordSchema.parse({
        ...directionApproval,
        status: "superseded",
        termination: {
          decidedAt: "2026-09-02T09:00:00Z",
          decidedBy: "github:product-reviewer",
          reason: "Version 2.0.0 replaces this approved direction.",
          replacementApprovalId: replacement.approvalId,
          type: "superseded",
        },
      });
      await Promise.all([
        writeJson(
          root,
          "approvals/directions/precise-friendly/1.0.0.approval.json",
          predecessor,
        ),
        writeJson(
          root,
          "approvals/directions/precise-friendly/2.0.0.approval.json",
          replacement,
        ),
      ]);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expect(result).toMatchObject({ ok: true });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("rejects Approval lineage from an older version to a newer predecessor", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeValidDesignSystem(root);
      const { directionApproval } = approvalFixtureData();
      const newerApproval = approvalRecordSchema.parse({
        ...directionApproval,
        approvalId: "approval.direction.precise-friendly.2.0.0",
        subject: {
          ...directionApproval.subject,
          assetVersion: "2.0.0",
        },
      });
      const invalidOlderApproval = approvalRecordSchema.parse({
        ...directionApproval,
        supersedes: newerApproval.approvalId,
      });
      await Promise.all([
        writeJson(
          root,
          "approvals/directions/precise-friendly/1.0.0.approval.json",
          invalidOlderApproval,
        ),
        writeJson(
          root,
          "approvals/directions/precise-friendly/2.0.0.approval.json",
          newerApproval,
        ),
      ]);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "approval_lineage_mismatch",
        path: "/supersedes",
        sourcePath: "approvals/directions/precise-friendly/1.0.0.approval.json",
      });
    } finally {
      await removeTemporaryRoot(root);
    }
  });

  it("rejects an Approval whose subject digest no longer matches the Token source", async () => {
    const root = await createTemporaryRoot();
    try {
      await writeValidDesignSystem(root);
      const { directionApproval, tokenApproval } = approvalFixtureData();
      await Promise.all([
        writeJson(
          root,
          "approvals/directions/precise-friendly/1.0.0.approval.json",
          directionApproval,
        ),
        writeJson(
          root,
          "approvals/tokens/button-foundation/1.0.0.approval.json",
          {
            ...tokenApproval,
            subject: {
              ...tokenApproval.subject,
              contentDigest: `sha256:${"e".repeat(64)}`,
            },
          },
        ),
      ]);

      const result = await loadDesignSystemFromDirectory({
        designSystemRoot: root,
        expectedProjectId: "hatch-demo",
      });

      expectIntegrityIssue(result, {
        code: "content_digest_mismatch",
        path: "/subject/contentDigest",
        sourcePath: "approvals/tokens/button-foundation/1.0.0.approval.json",
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
