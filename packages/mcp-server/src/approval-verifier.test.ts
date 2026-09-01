import {
  approvalRecordSchema,
  createFailureResult,
  createFigmaVariablePlan,
  createSuccessResult,
  createToolkitError,
  writerCommandEnvelopeSchema,
  type ApprovalRecord,
  type DesignSystemSnapshot,
} from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import { createGitApprovalVerifier } from "./approval-verifier.js";

const TOKEN_DIGEST = `sha256:${"a".repeat(64)}`;
const DIRECTION_DIGEST = `sha256:${"b".repeat(64)}`;

function approvedDirection(): ApprovalRecord {
  return approvalRecordSchema.parse({
    approvalId: "approval.direction.precise-friendly.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:20:00Z",
        decision: "approved",
        reviewer: "github:product-reviewer",
        role: "product_owner",
        summary: "Product alignment approved.",
      },
      {
        decidedAt: "2026-09-01T12:21:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "Visual direction approved.",
      },
    ],
    dependencies: [
      {
        approvalId: null,
        assetId: "product-foundation",
        assetVersion: "1.0.0",
        contentDigest: `sha256:${"c".repeat(64)}`,
        projectId: "hatch-demo",
        type: "brief",
      },
    ],
    evidence: [{ kind: "image", uri: "artifacts://review/direction.png" }],
    policy: {
      requiredRoles: ["product_owner", "design_owner"],
      requiredValidationChecks: ["schema", "visual-review"],
    },
    schemaVersion: "1.0.0",
    status: "approved",
    subject: {
      assetId: "precise-friendly",
      assetVersion: "1.0.0",
      contentDigest: DIRECTION_DIGEST,
      gitCommit: "d".repeat(40),
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
      {
        check: "schema",
        evidence: "artifacts://validation/direction-schema.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:05:00Z",
      },
      {
        check: "visual-review",
        evidence: "artifacts://validation/direction-visual.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:06:00Z",
      },
    ],
  });
}

function approvedToken(direction: ApprovalRecord): ApprovalRecord {
  return approvalRecordSchema.parse({
    approvalId: "approval.tokens.button-foundation.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:30:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "Token visual system approved.",
      },
      {
        decidedAt: "2026-09-01T12:31:00Z",
        decision: "approved",
        reviewer: "github:technical-reviewer",
        role: "technical_owner",
        summary: "Token structure approved.",
      },
    ],
    dependencies: [
      {
        approvalId: direction.approvalId,
        assetId: direction.subject.assetId,
        assetVersion: direction.subject.assetVersion,
        contentDigest: direction.subject.contentDigest,
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
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      contentDigest: TOKEN_DIGEST,
      gitCommit: "d".repeat(40),
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
      {
        check: "schema",
        evidence: "artifacts://validation/token-schema.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:05:00Z",
      },
      {
        check: "token-references",
        evidence: "artifacts://validation/token-references.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:06:00Z",
      },
      {
        check: "color-contrast",
        evidence: "artifacts://validation/color-contrast.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:07:00Z",
      },
    ],
  });
}

function snapshot(approvals: readonly ApprovalRecord[]): DesignSystemSnapshot {
  return {
    approvals: approvals.map((data) => ({
      data,
      sourcePath: `approvals/${data.approvalId}.approval.json`,
    })),
    briefs: [],
    components: [],
    projectId: "hatch-demo",
    registries: [],
    tokenSets: [],
  };
}

function variablesCommand(projectId = "hatch-demo") {
  const plan = createFigmaVariablePlan(validTokenSet, TOKEN_DIGEST);
  if (!plan.ok) throw new Error(plan.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: "approval.tokens.button-foundation.1.0.0",
      mode: "approved",
      subject: { ...plan.data.source, type: "token-set" },
    },
    command: { payload: { plan: plan.data }, type: "variables.ensure" },
    idempotencyKey: "approval-verifier-command",
    operationId: "2c73620e-29b0-4285-8861-1a65b18f11dc",
    projectId,
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: `${projectId}/figma-file/library`,
    },
  });
}

describe("Git Approval verifier", () => {
  it("re-reads the snapshot before every write and invalidates revoked dependencies", async () => {
    const direction = approvedDirection();
    const token = approvedToken(direction);
    const revokedDirection = approvalRecordSchema.parse({
      ...direction,
      status: "revoked",
      termination: {
        decidedAt: "2026-09-02T09:00:00Z",
        decidedBy: "github:product-reviewer",
        reason: "The direction was withdrawn after a brand review.",
        replacementApprovalId: null,
        type: "revoked",
      },
    });
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createSuccessResult(snapshot([direction, token])))
      .mockResolvedValueOnce(
        createSuccessResult(snapshot([revokedDirection, token])),
      );
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      { loadSnapshot },
    );

    expect(await verify(variablesCommand())).toBeNull();
    expect(await verify(variablesCommand())).toMatchObject({
      code: "APPROVAL_STALE",
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("blocks a missing direct approval", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValue(createSuccessResult(snapshot([])));
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      { loadSnapshot },
    );

    expect(await verify(variablesCommand())).toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
  });

  it("propagates fail-closed catalog integrity errors", async () => {
    const loadSnapshot = vi.fn().mockResolvedValue(
      createFailureResult(
        createToolkitError({
          code: "VALIDATION_FAILED",
          message: "The Approval catalog is invalid.",
          recoveryInstruction: "Repair the catalog before retrying.",
        }),
      ),
    );
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      { loadSnapshot },
    );

    expect(await verify(variablesCommand())).toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("blocks a project mismatch before reading the catalog", async () => {
    const loadSnapshot = vi.fn();
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "other-project" },
      { loadSnapshot },
    );

    expect(await verify(variablesCommand())).toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
    expect(loadSnapshot).not.toHaveBeenCalled();
  });
});
