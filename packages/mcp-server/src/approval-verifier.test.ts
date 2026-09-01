import {
  approvalRecordSchema,
  buttonComponentContractSchema,
  componentRegistrySchema,
  createFailureResult,
  createFigmaButtonInstancePlan,
  createFigmaButtonPlan,
  createFigmaIconPlan,
  createFigmaVariablePlan,
  createSuccessResult,
  createToolkitError,
  iconComponentContractSchema,
  tokenSetSchema,
  writerCommandEnvelopeSchema,
  type ApprovalRecord,
  type DesignSystemSnapshot,
} from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import iconContractFixture from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconTokenFixture from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import { createGitApprovalVerifier } from "./approval-verifier.js";

const TOKEN_DIGEST = `sha256:${"a".repeat(64)}`;
const DIRECTION_DIGEST = `sha256:${"b".repeat(64)}`;
const TOKEN_SET = tokenSetSchema.parse(validTokenSet);
const BUTTON_CONTRACT = buttonComponentContractSchema.parse(validContract);
const COMPONENT_DIGEST =
  "sha256:7e6003e59916e0fc445e7ef6d37feb148a3d77908bb7834b3bdb4185530d0e78";
const ICON_COMPONENT_DIGEST =
  "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260";
const ICON_TOKEN_DIGEST =
  "sha256:3e6525097fe95c63b373adf9b7a6797e3153a4670665c0da9563fc971f62315e";
const ICON_CONTRACT = iconComponentContractSchema.parse(iconContractFixture);
const ICON_TOKENS = tokenSetSchema.parse(iconTokenFixture);

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

function approvedComponent(token: ApprovalRecord): ApprovalRecord {
  return approvalRecordSchema.parse({
    approvalId: "approval.component.button.1.0.0",
    decisions: [
      {
        decidedAt: "2026-09-01T12:40:00Z",
        decision: "approved",
        reviewer: "github:design-reviewer",
        role: "design_owner",
        summary: "Button visual contract approved.",
      },
      {
        decidedAt: "2026-09-01T12:41:00Z",
        decision: "approved",
        reviewer: "github:technical-reviewer",
        role: "technical_owner",
        summary: "Button technical contract approved.",
      },
    ],
    dependencies: [
      {
        approvalId: token.approvalId,
        assetId: token.subject.assetId,
        assetVersion: token.subject.assetVersion,
        contentDigest: token.subject.contentDigest,
        projectId: token.subject.projectId,
        type: "token-set",
      },
    ],
    evidence: [{ kind: "figma", uri: "artifacts://review/button.json" }],
    policy: {
      requiredRoles: ["design_owner", "technical_owner"],
      requiredValidationChecks: [
        "schema",
        "contract-figma-parity",
        "token-references",
        "accessibility",
      ],
    },
    schemaVersion: "1.0.0",
    status: "approved",
    subject: {
      assetId: "button",
      assetVersion: "1.0.0",
      contentDigest: COMPONENT_DIGEST,
      gitCommit: "d".repeat(40),
      projectId: "hatch-demo",
      type: "component",
    },
    submission: {
      submittedAt: "2026-09-01T12:00:00Z",
      submittedBy: "agent:codex",
    },
    supersedes: null,
    termination: null,
    validations: [
      "schema",
      "contract-figma-parity",
      "token-references",
      "accessibility",
    ].map((check, index) => ({
      check,
      evidence: `artifacts://validation/button-${check}.json`,
      priority: "P0",
      status: "passed",
      validatedAt: `2026-09-01T12:${String(42 + index).padStart(2, "0")}:00Z`,
    })),
  });
}

function approvedIconToken(direction: ApprovalRecord): ApprovalRecord {
  const record = structuredClone(approvedToken(direction));
  record.approvalId = "approval.tokens.icon-foundation.1.0.0";
  record.subject.assetId = "icon-foundation";
  record.subject.contentDigest = ICON_TOKEN_DIGEST;
  return approvalRecordSchema.parse(record);
}

function approvedIconComponent(token: ApprovalRecord): ApprovalRecord {
  const record = structuredClone(approvedComponent(token));
  record.approvalId = "approval.component.icon.check.1.0.0";
  record.subject.assetId = "icon/check";
  record.subject.contentDigest = ICON_COMPONENT_DIGEST;
  return approvalRecordSchema.parse(record);
}

function snapshot(approvals: readonly ApprovalRecord[]): DesignSystemSnapshot {
  return {
    approvals: approvals.map((data) => ({
      data,
      sourcePath: `approvals/${data.approvalId}.approval.json`,
    })),
    briefs: [],
    components: [
      {
        data: BUTTON_CONTRACT,
        sourcePath: "design-system/hatch-demo/components/button.component.json",
      },
    ],
    directions: [],
    projectId: "hatch-demo",
    registries: [
      {
        data: componentRegistrySchema.parse(validRegistry),
        sourcePath:
          "design-system/hatch-demo/registry/components.registry.json",
      },
    ],
    tokenSets: [
      {
        data: TOKEN_SET,
        sourcePath:
          "design-system/hatch-demo/tokens/button-foundation.tokens.json",
      },
    ],
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

function buttonCommand() {
  const plan = createFigmaButtonPlan(
    BUTTON_CONTRACT,
    TOKEN_SET,
    COMPONENT_DIGEST,
    TOKEN_DIGEST,
  );
  if (!plan.ok) throw new Error(plan.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: "approval.component.button.1.0.0",
      mode: "approved",
      subject: { ...plan.data.source, type: "component" },
    },
    command: {
      payload: { plan: plan.data },
      type: "components.button.ensure",
    },
    idempotencyKey: "button-approval-verifier-command",
    operationId: "4d73620e-29b0-4285-8861-1a65b18f11dc",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

function iconCommand() {
  const plan = createFigmaIconPlan(
    ICON_CONTRACT,
    ICON_TOKENS,
    ICON_COMPONENT_DIGEST,
    ICON_TOKEN_DIGEST,
  );
  if (!plan.ok) throw new Error(plan.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: "approval.component.icon.check.1.0.0",
      mode: "approved",
      subject: { ...plan.data.source, type: "component" },
    },
    command: {
      payload: { plan: plan.data },
      type: "components.icon.ensure",
    },
    idempotencyKey: "icon-approval-verifier-command",
    operationId: "6d73620e-29b0-4285-8861-1a65b18f11dc",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

function instanceCommand() {
  const planned = createFigmaButtonInstancePlan(snapshot([]), {
    assetId: "button",
    instanceId: "screen-checkout/submit",
    label: "Place order",
    projectId: "hatch-demo",
    variantSelections: { appearance: "primary", state: "default" },
    x: 100,
    y: 200,
  });
  if (!planned.ok) throw new Error(planned.error.message);
  return writerCommandEnvelopeSchema.parse({
    approval: {
      approvalId: planned.data.source.approvalId,
      mode: "approved",
      subject: {
        assetId: planned.data.source.assetId,
        assetVersion: planned.data.source.assetVersion,
        contentDigest: planned.data.source.contentDigest,
        projectId: planned.data.source.projectId,
        type: "component",
      },
    },
    command: {
      payload: { plan: planned.data },
      type: "instances.button.insert",
    },
    idempotencyKey: "instance-approval-verifier-command",
    operationId: "5d73620e-29b0-4285-8861-1a65b18f11dc",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "mcp-server" },
    target: {
      fileBindingId: planned.data.source.fileBindingId,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  });
}

describe("Git Approval verifier", () => {
  it("rebuilds the entire Registry-backed Instance plan and rejects client tampering", async () => {
    const direction = approvedDirection();
    const token = approvedToken(direction);
    const component = approvedComponent(token);
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: () =>
          Promise.resolve(
            createSuccessResult(snapshot([direction, token, component])),
          ),
      },
    );
    expect(await verify(instanceCommand())).toBeNull();

    const tampered = structuredClone(instanceCommand());
    if (tampered.command.type !== "instances.button.insert") {
      throw new Error("Expected Instance command.");
    }
    tampered.command.payload.plan.selectedVariant.figmaName =
      "Appearance=Secondary, State=Default";
    await expect(verify(tampered)).resolves.toMatchObject({
      code: "APPROVAL_STALE",
    });
  });

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

  it("rejects a structurally valid client plan that differs from Git", async () => {
    const direction = approvedDirection();
    const token = approvedToken(direction);
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: vi
          .fn()
          .mockResolvedValue(createSuccessResult(snapshot([direction, token]))),
      },
    );
    const changed = structuredClone(variablesCommand());
    if (changed.command.type !== "variables.ensure") {
      throw new Error("Variable command fixture drifted.");
    }
    const firstVariable = changed.command.payload.plan.variables[0];
    if (firstVariable === undefined)
      throw new Error("Variable fixture missing.");
    firstVariable.description = "A client-controlled but schema-valid change.";
    const parsed = writerCommandEnvelopeSchema.parse(changed);

    expect(await verify(parsed)).toMatchObject({ code: "APPROVAL_STALE" });
  });

  it("rebuilds an approved Button plan with its exact Token dependency", async () => {
    const direction = approvedDirection();
    const token = approvedToken(direction);
    const component = approvedComponent(token);
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: vi
          .fn()
          .mockResolvedValue(
            createSuccessResult(snapshot([direction, token, component])),
          ),
      },
    );

    expect(await verify(buttonCommand())).toBeNull();
    const changed = structuredClone(buttonCommand());
    if (changed.command.type !== "components.button.ensure") {
      throw new Error("Button command fixture drifted.");
    }
    changed.command.payload.plan.componentSet.description =
      "A schema-valid but unapproved Button plan.";
    expect(
      await verify(writerCommandEnvelopeSchema.parse(changed)),
    ).toMatchObject({ code: "APPROVAL_STALE" });
  });

  it("rebuilds an approved Icon plan with its exact Token dependency", async () => {
    const direction = approvedDirection();
    const token = approvedIconToken(direction);
    const component = approvedIconComponent(token);
    const base = snapshot([direction, token, component]);
    const current: DesignSystemSnapshot = {
      ...base,
      components: [
        ...base.components,
        {
          data: ICON_CONTRACT,
          sourcePath: "components/icon-check.component.json",
        },
      ],
      tokenSets: [
        ...base.tokenSets,
        {
          data: ICON_TOKENS,
          sourcePath: "tokens/icon-foundation.tokens.json",
        },
      ],
    };
    const verify = createGitApprovalVerifier(
      { designSystemRoot: "/unused", expectedProjectId: "hatch-demo" },
      {
        loadSnapshot: vi.fn().mockResolvedValue(createSuccessResult(current)),
      },
    );

    expect(await verify(iconCommand())).toBeNull();
    const changed = structuredClone(iconCommand());
    if (changed.command.type !== "components.icon.ensure") {
      throw new Error("Icon command fixture drifted.");
    }
    changed.command.payload.plan.componentSet.description =
      "A schema-valid but unapproved Icon plan.";
    expect(
      await verify(writerCommandEnvelopeSchema.parse(changed)),
    ).toMatchObject({ code: "APPROVAL_STALE" });
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
