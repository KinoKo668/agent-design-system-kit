import { describe, expect, it } from "vitest";

import {
  approvalIdForSubject,
  approvalRecordSchema,
  approvalStatusErrorCode,
  checkApprovalForUse,
  deriveApprovalStatus,
  requiredApprovalRoles,
  validateApprovalRecord,
  type ApprovalRecord,
} from "./approval-record.js";

const SUBJECT_DIGEST = `sha256:${"a".repeat(64)}`;
const DIRECTION_DIGEST = `sha256:${"b".repeat(64)}`;
const GIT_COMMIT = "c".repeat(40);

function approvedDirectionRecord(): ApprovalRecord {
  return approvalRecordSchema.parse({
    approvalId: "approval.direction.precise-friendly.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:20:00Z",
        decision: "approved",
        reviewer: "github:product-reviewer",
        role: "product_owner",
        summary: "Product and brand alignment are approved.",
      },
      {
        decidedAt: "2026-09-01T12:21:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "Visual quality and extensibility are approved.",
      },
    ],
    dependencies: [
      {
        approvalId: null,
        assetId: "product-foundation",
        assetVersion: "1.0.0",
        contentDigest: `sha256:${"f".repeat(64)}`,
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
      contentDigest: DIRECTION_DIGEST,
      gitCommit: GIT_COMMIT,
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
        evidence: "artifacts://validation/direction-visual-review.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:06:00Z",
      },
    ],
  });
}

function approvedTokenRecord(): ApprovalRecord {
  return approvalRecordSchema.parse({
    approvalId: "approval.tokens.button-foundation.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:20:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "Visual system, semantics, and preview are approved.",
      },
      {
        decidedAt: "2026-09-01T12:25:00Z",
        decision: "approved",
        reviewer: "github:technical-reviewer",
        role: "technical_owner",
        summary: "Schema, references, versioning, and migration are approved.",
      },
    ],
    dependencies: [
      {
        approvalId: "approval.direction.precise-friendly.1.0.0",
        assetId: "precise-friendly",
        assetVersion: "1.0.0",
        contentDigest: DIRECTION_DIGEST,
        projectId: "hatch-demo",
        type: "direction",
      },
    ],
    evidence: [
      {
        kind: "figma",
        uri: "https://www.figma.com/design/public-fixture",
      },
      {
        kind: "report",
        uri: "artifacts://validation/token-accessibility.json",
      },
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
      contentDigest: SUBJECT_DIGEST,
      gitCommit: GIT_COMMIT,
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
        evidence: "artifacts://validation/token-accessibility.json",
        priority: "P0",
        status: "passed",
        validatedAt: "2026-09-01T12:07:00Z",
      },
    ],
  });
}

describe("Approval Record", () => {
  it("accepts a complete Token approval and derives its status", () => {
    const record = approvedTokenRecord();

    expect(deriveApprovalStatus(record)).toBe("approved");
    expect(validateApprovalRecord(record)).toMatchObject({
      data: { approvalId: record.approvalId, status: "approved" },
      ok: true,
    });
    expect(requiredApprovalRoles("token-set")).toEqual([
      "design_owner",
      "technical_owner",
    ]);
  });

  it("builds deterministic approval IDs including nested asset IDs", () => {
    expect(
      approvalIdForSubject({
        assetId: "controls/button",
        assetVersion: "2.1.0-beta.1",
        type: "component",
      }),
    ).toBe("approval.component.controls.button.2.1.0-beta.1");
  });

  it("does not trust a stored approved status with incomplete human decisions", () => {
    const valid = approvedTokenRecord();
    const result = validateApprovalRecord({
      ...valid,
      decisions: valid.decisions.slice(0, 1),
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected incomplete approval to fail.");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "Stored status 'approved' does not match derived status 'in_review'.",
          path: "/status",
        }),
      ]),
    );
  });

  it("rejects an Agent pretending to be a human reviewer", () => {
    const valid = approvedTokenRecord();
    const result = validateApprovalRecord({
      ...valid,
      decisions: valid.decisions.map((decision, index) =>
        index === 0 ? { ...decision, reviewer: "agent:codex" } : decision,
      ),
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected fake reviewer to fail.");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/decisions/0/reviewer" }),
      ]),
    );
  });

  it("requires the frozen roles and upstream dependency type", () => {
    const valid = approvedTokenRecord();
    const result = validateApprovalRecord({
      ...valid,
      dependencies: [
        {
          ...valid.dependencies[0],
          approvalId: null,
          type: "brief",
        },
      ],
      policy: {
        ...valid.policy,
        requiredRoles: ["product_owner", "design_owner"],
      },
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected invalid policy to fail.");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/dependencies" }),
        expect.objectContaining({ path: "/policy/requiredRoles" }),
      ]),
    );
  });

  it("derives negative and terminal states from evidence", () => {
    const valid = approvedTokenRecord();
    const changesRequested = approvalRecordSchema.parse({
      ...valid,
      decisions: [
        {
          ...valid.decisions[0],
          decision: "changes_requested",
        },
      ],
      status: "changes_requested",
    });
    expect(deriveApprovalStatus(changesRequested)).toBe("changes_requested");

    const revoked = approvalRecordSchema.parse({
      ...valid,
      status: "revoked",
      termination: {
        decidedAt: "2026-09-02T09:00:00Z",
        decidedBy: "github:design-reviewer",
        reason: "A material accessibility issue requires immediate withdrawal.",
        replacementApprovalId: null,
        type: "revoked",
      },
    });
    expect(deriveApprovalStatus(revoked)).toBe("revoked");
    expect(approvalStatusErrorCode(revoked.status)).toBe("APPROVAL_REVOKED");
  });

  it("compares review timestamps on the real timeline across offsets", () => {
    const valid = approvedTokenRecord();
    const result = validateApprovalRecord({
      ...valid,
      decisions: valid.decisions.map((decision, index) =>
        index === 0
          ? { ...decision, decidedAt: "2026-09-01T07:30:00-05:00" }
          : decision,
      ),
      submission: {
        ...valid.submission,
        submittedAt: "2026-09-01T13:00:00+01:00",
      },
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("rejects a terminal event that predates completed review evidence", () => {
    const valid = approvedTokenRecord();
    const result = validateApprovalRecord({
      ...valid,
      status: "revoked",
      termination: {
        decidedAt: "2026-09-01T12:10:00Z",
        decidedBy: "github:design-reviewer",
        reason: "This event was recorded before final human decisions.",
        replacementApprovalId: null,
        type: "revoked",
      },
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected premature termination to fail.");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/termination/decidedAt" }),
      ]),
    );
  });

  it("requires all named P0 validations to pass", () => {
    const valid = approvedTokenRecord();
    const result = validateApprovalRecord({
      ...valid,
      validations: valid.validations.map((validation) =>
        validation.check === "color-contrast"
          ? { ...validation, status: "failed" }
          : validation,
      ),
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected failed validation to fail.");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/status" })]),
    );
  });

  it("reports unsupported schema versions separately", () => {
    const result = validateApprovalRecord({ schemaVersion: "2.0.0" });

    expect(result).toMatchObject({
      error: { code: "SCHEMA_VERSION_UNSUPPORTED" },
      ok: false,
    });
  });

  it("authorizes only an exact approved subject with an active dependency chain", () => {
    const direction = approvedDirectionRecord();
    const token = approvedTokenRecord();
    const expected = {
      approvalId: token.approvalId,
      ...token.subject,
    };

    expect(checkApprovalForUse([direction, token], expected)).toBeNull();
    expect(
      checkApprovalForUse([direction, token], {
        ...expected,
        contentDigest: `sha256:${"9".repeat(64)}`,
      }),
    ).toMatchObject({ code: "APPROVAL_STALE" });
    expect(checkApprovalForUse([direction], expected)).toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
  });

  it("returns missing conditions for an incomplete direct approval", () => {
    const direction = approvedDirectionRecord();
    const approved = approvedTokenRecord();
    const inReview = approvalRecordSchema.parse({
      ...approved,
      decisions: approved.decisions.slice(0, 1),
      status: "in_review",
    });
    const error = checkApprovalForUse([direction, inReview], {
      approvalId: inReview.approvalId,
      ...inReview.subject,
    });

    expect(error).toMatchObject({
      code: "APPROVAL_INCOMPLETE",
      context: { missingConditions: ["role:technical_owner"] },
    });
  });

  it("invalidates a downstream approval when its upstream approval is revoked", () => {
    const approvedDirection = approvedDirectionRecord();
    const revokedDirection = approvalRecordSchema.parse({
      ...approvedDirection,
      status: "revoked",
      termination: {
        decidedAt: "2026-09-02T09:00:00Z",
        decidedBy: "github:product-reviewer",
        reason: "The selected direction conflicts with revised brand policy.",
        replacementApprovalId: null,
        type: "revoked",
      },
    });
    const token = approvedTokenRecord();
    const error = checkApprovalForUse([revokedDirection, token], {
      approvalId: token.approvalId,
      ...token.subject,
    });

    expect(error).toMatchObject({
      code: "APPROVAL_STALE",
      context: {
        missingConditions: [
          `dependency_revoked:${revokedDirection.approvalId}`,
        ],
      },
    });
  });

  it("blocks duplicate identities anywhere in the dependency catalog", () => {
    const direction = approvedDirectionRecord();
    const token = approvedTokenRecord();
    const error = checkApprovalForUse([direction, direction, token], {
      approvalId: token.approvalId,
      ...token.subject,
    });

    expect(error).toMatchObject({ code: "IDENTITY_CONFLICT" });
  });
});
