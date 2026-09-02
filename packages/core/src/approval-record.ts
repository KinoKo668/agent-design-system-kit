import * as z from "zod";

import { createToolkitError, type ErrorCode } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import {
  getProvidedSchemaVersion,
  toValidationIssues,
  type SchemaValidationIssue,
} from "./schema-validation.js";

export const APPROVAL_RECORD_SCHEMA_VERSION = "1.0.0" as const;

export const APPROVAL_SUBJECT_TYPES = [
  "component",
  "direction",
  "platform-binding",
  "platform-target",
  "token-set",
] as const;
export type ApprovalSubjectType = (typeof APPROVAL_SUBJECT_TYPES)[number];

export const APPROVAL_DEPENDENCY_TYPES = [
  "brief",
  "component",
  "direction",
  "platform-target",
  "token-set",
] as const;
export type ApprovalDependencyType = (typeof APPROVAL_DEPENDENCY_TYPES)[number];

export const APPROVAL_ROLES = [
  "design_owner",
  "product_owner",
  "technical_owner",
] as const;
export type ApprovalRole = (typeof APPROVAL_ROLES)[number];

export const APPROVAL_STATUSES = [
  "approved",
  "changes_requested",
  "draft",
  "in_review",
  "rejected",
  "revoked",
  "superseded",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

const REQUIRED_ROLES = {
  component: ["design_owner", "technical_owner"],
  direction: ["product_owner", "design_owner"],
  "platform-binding": ["design_owner", "technical_owner"],
  "platform-target": ["product_owner", "design_owner", "technical_owner"],
  "token-set": ["design_owner", "technical_owner"],
} as const satisfies Record<ApprovalSubjectType, readonly ApprovalRole[]>;

const EXPECTED_DEPENDENCY_TYPES = {
  component: ["token-set"],
  direction: ["brief"],
  "platform-binding": ["component", "platform-target"],
  "platform-target": ["direction"],
  "token-set": ["direction"],
} as const satisfies Record<
  ApprovalSubjectType,
  readonly ApprovalDependencyType[]
>;

const REQUIRED_VALIDATION_CHECKS = {
  component: [
    "schema",
    "contract-figma-parity",
    "token-references",
    "accessibility",
  ],
  direction: ["schema", "visual-review"],
  "platform-binding": [
    "schema",
    "contract-figma-parity",
    "official-source",
    "instance-import",
    "no-detach",
  ],
  "platform-target": ["schema", "official-source", "license-boundary"],
  "token-set": ["schema", "token-references", "color-contrast"],
} as const satisfies Record<ApprovalSubjectType, readonly string[]>;

const APPROVAL_ID_PREFIX = {
  component: "component",
  direction: "direction",
  "platform-binding": "platform-binding",
  "platform-target": "platform-target",
  "token-set": "tokens",
} as const satisfies Record<ApprovalSubjectType, string>;

function containsDisallowedControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }
  return false;
}

function requiredText(maxLength: number): z.ZodString {
  return z
    .string()
    .min(1, "Must not be empty.")
    .max(maxLength, `Must contain at most ${String(maxLength)} characters.`)
    .refine((value) => value.trim() === value, {
      message: "Must not start or end with whitespace.",
    })
    .refine((value) => !containsDisallowedControlCharacter(value), {
      message: "Must not contain control characters.",
    });
}

const approvalIdSchema = requiredText(320).regex(
  /^approval\.(?:component|direction|platform-binding|platform-target|tokens)\.[a-z0-9.+-]+$/u,
  "Must use a deterministic approval.<type>.<asset>.<version> identity.",
);
const gitCommitSchema = z
  .string()
  .regex(
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u,
    "Must be a lowercase 40- or 64-character Git object ID.",
  );
const actorIdentitySchema = requiredText(160).regex(
  /^(?:agent|github|human):[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u,
  "Must identify an agent or human using agent:, github:, or human:.",
);
const humanIdentitySchema = requiredText(160).regex(
  /^(?:github|human):[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u,
  "Reviewer identities must represent a real human using github: or human:.",
);
const evidenceUriSchema = requiredText(2_048).regex(
  /^(?:artifacts|git|https|local-review):\/\/.+$/u,
  "Evidence must use artifacts://, git://, https://, or local-review://.",
);

const approvalSubjectSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema,
  contentDigest: contentDigestSchema,
  gitCommit: gitCommitSchema,
  projectId: stableIdSegmentSchema,
  type: z.enum(APPROVAL_SUBJECT_TYPES),
});

const approvalDependencySchema = z.strictObject({
  approvalId: approvalIdSchema.nullable(),
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema,
  contentDigest: contentDigestSchema,
  projectId: stableIdSegmentSchema,
  type: z.enum(APPROVAL_DEPENDENCY_TYPES),
});

const approvalDecisionSchema = z.strictObject({
  decidedAt: z.iso.datetime({ offset: true }),
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  reviewer: humanIdentitySchema,
  role: z.enum(APPROVAL_ROLES),
  summary: requiredText(1_000),
});

const approvalValidationSchema = z.strictObject({
  check: stableAssetIdSchema,
  evidence: evidenceUriSchema,
  priority: z.enum(["P0", "P1", "P2"]),
  status: z.enum(["failed", "passed"]),
  validatedAt: z.iso.datetime({ offset: true }),
});

const approvalEvidenceSchema = z.strictObject({
  kind: z.enum(["diff", "figma", "image", "report", "other"]),
  uri: evidenceUriSchema,
});

const approvalTerminationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    decidedAt: z.iso.datetime({ offset: true }),
    decidedBy: humanIdentitySchema,
    reason: requiredText(1_000),
    replacementApprovalId: z.null(),
    type: z.literal("revoked"),
  }),
  z.strictObject({
    decidedAt: z.iso.datetime({ offset: true }),
    decidedBy: humanIdentitySchema,
    reason: requiredText(1_000),
    replacementApprovalId: approvalIdSchema,
    type: z.literal("superseded"),
  }),
]);

const approvalRecordBaseSchema = z.strictObject({
  approvalId: approvalIdSchema,
  decisions: z.array(approvalDecisionSchema).max(8),
  dependencies: z.array(approvalDependencySchema).min(1).max(8),
  evidence: z.array(approvalEvidenceSchema).max(32),
  policy: z.strictObject({
    requiredRoles: z.array(z.enum(APPROVAL_ROLES)).min(1).max(3),
    requiredValidationChecks: z.array(stableAssetIdSchema).min(1).max(32),
  }),
  schemaVersion: z.literal(APPROVAL_RECORD_SCHEMA_VERSION),
  status: z.enum(APPROVAL_STATUSES),
  subject: approvalSubjectSchema,
  submission: z.strictObject({
    submittedAt: z.iso.datetime({ offset: true }).nullable(),
    submittedBy: actorIdentitySchema,
  }),
  supersedes: approvalIdSchema.nullable(),
  termination: approvalTerminationSchema.nullable(),
  validations: z.array(approvalValidationSchema).max(64),
});

type ApprovalRecordBase = z.infer<typeof approvalRecordBaseSchema>;

export interface ApprovalIdentitySubject {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly type: ApprovalSubjectType;
}

export function approvalIdForSubject(subject: ApprovalIdentitySubject): string {
  return `approval.${APPROVAL_ID_PREFIX[subject.type]}.${subject.assetId.replaceAll("/", ".")}.${subject.assetVersion}`;
}

export function requiredApprovalRoles(
  subjectType: ApprovalSubjectType,
): readonly ApprovalRole[] {
  return REQUIRED_ROLES[subjectType];
}

export function requiredApprovalValidationChecks(
  subjectType: ApprovalSubjectType,
): readonly string[] {
  return REQUIRED_VALIDATION_CHECKS[subjectType];
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function occursBefore(left: string, right: string): boolean {
  return Date.parse(left) < Date.parse(right);
}

function requiredApprovalConditionsPass(record: ApprovalRecordBase): boolean {
  const decisions = new Map(
    record.decisions.map((decision) => [decision.role, decision.decision]),
  );
  const validations = new Map(
    record.validations.map((validation) => [validation.check, validation]),
  );
  return (
    record.submission.submittedAt !== null &&
    record.policy.requiredRoles.every(
      (role) => decisions.get(role) === "approved",
    ) &&
    record.policy.requiredValidationChecks.every((check) => {
      const validation = validations.get(check);
      return validation?.priority === "P0" && validation.status === "passed";
    }) &&
    record.validations.every(
      (validation) =>
        validation.priority !== "P0" || validation.status === "passed",
    ) &&
    record.evidence.length > 0
  );
}

export function deriveApprovalStatus(
  record: ApprovalRecordBase,
): ApprovalStatus {
  if (record.termination !== null) return record.termination.type;
  if (record.submission.submittedAt === null) return "draft";
  if (record.decisions.some(({ decision }) => decision === "rejected")) {
    return "rejected";
  }
  if (
    record.decisions.some(({ decision }) => decision === "changes_requested")
  ) {
    return "changes_requested";
  }
  return requiredApprovalConditionsPass(record) ? "approved" : "in_review";
}

function addCustomIssue(
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

export const approvalRecordSchema = approvalRecordBaseSchema.superRefine(
  (record, context) => {
    const expectedApprovalId = approvalIdForSubject(record.subject);
    if (record.approvalId !== expectedApprovalId) {
      addCustomIssue(
        context,
        ["approvalId"],
        `Approval ID must be '${expectedApprovalId}'.`,
      );
    }

    const expectedRoles = requiredApprovalRoles(record.subject.type);
    if (
      !hasUniqueValues(record.policy.requiredRoles) ||
      record.policy.requiredRoles.length !== expectedRoles.length ||
      expectedRoles.some((role) => !record.policy.requiredRoles.includes(role))
    ) {
      addCustomIssue(
        context,
        ["policy", "requiredRoles"],
        `Required roles for ${record.subject.type} must be ${expectedRoles.join(" and ")}.`,
      );
    }
    if (!hasUniqueValues(record.policy.requiredValidationChecks)) {
      addCustomIssue(
        context,
        ["policy", "requiredValidationChecks"],
        "Required validation checks must be unique.",
      );
    }
    const mandatoryChecks = requiredApprovalValidationChecks(
      record.subject.type,
    );
    const missingMandatoryChecks = mandatoryChecks.filter(
      (check) => !record.policy.requiredValidationChecks.includes(check),
    );
    if (missingMandatoryChecks.length > 0) {
      addCustomIssue(
        context,
        ["policy", "requiredValidationChecks"],
        `${record.subject.type} approval policy is missing required checks: ${missingMandatoryChecks.join(", ")}.`,
      );
    }

    const expectedDependencyTypes =
      EXPECTED_DEPENDENCY_TYPES[record.subject.type];
    const expectedDependencyTypeSet = new Set<ApprovalDependencyType>(
      expectedDependencyTypes,
    );
    const actualDependencyTypes = record.dependencies.map(({ type }) => type);
    if (
      record.dependencies.length !== expectedDependencyTypes.length ||
      expectedDependencyTypes.some(
        (type) => !actualDependencyTypes.includes(type),
      ) ||
      record.dependencies.some(
        (dependency) => !expectedDependencyTypeSet.has(dependency.type),
      )
    ) {
      addCustomIssue(
        context,
        ["dependencies"],
        `${record.subject.type} approvals require exactly: ${expectedDependencyTypes.join(" and ")}.`,
      );
    }
    const dependencyIdentities = record.dependencies.map(
      (dependency) =>
        `${dependency.projectId}/${dependency.type}/${dependency.assetId}@${dependency.assetVersion}`,
    );
    if (!hasUniqueValues(dependencyIdentities)) {
      addCustomIssue(
        context,
        ["dependencies"],
        "Approval dependencies must have unique logical identities.",
      );
    }
    record.dependencies.forEach((dependency, dependencyIndex) => {
      if (dependency.projectId !== record.subject.projectId) {
        addCustomIssue(
          context,
          ["dependencies", dependencyIndex, "projectId"],
          "Approval dependencies must belong to the same project.",
        );
      }
      if (dependency.type === "brief") {
        if (dependency.approvalId !== null) {
          addCustomIssue(
            context,
            ["dependencies", dependencyIndex, "approvalId"],
            "Design Brief dependencies do not carry an approval ID.",
          );
        }
      } else {
        const dependencySubject = {
          assetId: dependency.assetId,
          assetVersion: dependency.assetVersion,
          type: dependency.type,
        } as const;
        const expectedDependencyApprovalId =
          approvalIdForSubject(dependencySubject);
        if (dependency.approvalId !== expectedDependencyApprovalId) {
          addCustomIssue(
            context,
            ["dependencies", dependencyIndex, "approvalId"],
            `Dependency approval ID must be '${expectedDependencyApprovalId}'.`,
          );
        }
      }
    });

    const decisionRoles = record.decisions.map(({ role }) => role);
    if (!hasUniqueValues(decisionRoles)) {
      addCustomIssue(
        context,
        ["decisions"],
        "Each required role may record only one decision for an exact version.",
      );
    }
    record.decisions.forEach((decision, decisionIndex) => {
      if (!record.policy.requiredRoles.includes(decision.role)) {
        addCustomIssue(
          context,
          ["decisions", decisionIndex, "role"],
          "Decision role must be required by this approval policy.",
        );
      }
      if (
        record.submission.submittedAt === null ||
        occursBefore(decision.decidedAt, record.submission.submittedAt)
      ) {
        addCustomIssue(
          context,
          ["decisions", decisionIndex, "decidedAt"],
          "A human decision must occur after the exact version was submitted.",
        );
      }
    });

    const validationChecks = record.validations.map(({ check }) => check);
    if (!hasUniqueValues(validationChecks)) {
      addCustomIssue(
        context,
        ["validations"],
        "Each validation check may appear only once.",
      );
    }
    record.validations.forEach((validation, validationIndex) => {
      if (
        record.submission.submittedAt === null ||
        occursBefore(validation.validatedAt, record.submission.submittedAt)
      ) {
        addCustomIssue(
          context,
          ["validations", validationIndex, "validatedAt"],
          "Validation evidence must be produced after the exact version was submitted.",
        );
      }
    });

    if (record.submission.submittedAt === null) {
      if (
        record.decisions.length > 0 ||
        record.validations.length > 0 ||
        record.termination !== null
      ) {
        addCustomIssue(
          context,
          ["submission", "submittedAt"],
          "A draft cannot contain decisions, validations, or a terminal event.",
        );
      }
    }

    if (record.termination !== null) {
      if (!requiredApprovalConditionsPass(record)) {
        addCustomIssue(
          context,
          ["termination"],
          "Only a previously complete approval may be superseded or revoked.",
        );
      }
      if (
        record.submission.submittedAt === null ||
        occursBefore(
          record.termination.decidedAt,
          record.submission.submittedAt,
        )
      ) {
        addCustomIssue(
          context,
          ["termination", "decidedAt"],
          "A terminal decision must occur after submission.",
        );
      }
      const reviewTimestamps = [
        ...record.decisions.map(({ decidedAt }) => decidedAt),
        ...record.validations.map(({ validatedAt }) => validatedAt),
      ];
      const terminalAt = record.termination.decidedAt;
      if (
        reviewTimestamps.some((timestamp) =>
          occursBefore(terminalAt, timestamp),
        )
      ) {
        addCustomIssue(
          context,
          ["termination", "decidedAt"],
          "A terminal decision must occur after all approval decisions and validations.",
        );
      }
      if (
        record.termination.type === "superseded" &&
        record.termination.replacementApprovalId === record.approvalId
      ) {
        addCustomIssue(
          context,
          ["termination", "replacementApprovalId"],
          "An approval cannot supersede itself.",
        );
      }
    }

    if (record.supersedes === record.approvalId) {
      addCustomIssue(
        context,
        ["supersedes"],
        "An approval cannot list itself as its predecessor.",
      );
    }

    const derivedStatus = deriveApprovalStatus(record);
    if (record.status !== derivedStatus) {
      addCustomIssue(
        context,
        ["status"],
        `Stored status '${record.status}' does not match derived status '${derivedStatus}'.`,
      );
    }
  },
);

export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
export type ApprovalRecordValidationIssue = SchemaValidationIssue;

export interface ApprovalUseSubject {
  readonly approvalId: string;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly contentDigest: string;
  readonly projectId: string;
  readonly type: ApprovalSubjectType;
}

export function validateApprovalRecord(
  input: unknown,
): ToolkitResult<ApprovalRecord> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== APPROVAL_RECORD_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: APPROVAL_RECORD_SCHEMA_VERSION },
        },
        message: "The Approval Record schema version is not supported.",
        recoveryInstruction:
          "Use Approval Record schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "approval-record-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }

  const result = approvalRecordSchema.safeParse(input);
  if (result.success) return createSuccessResult(result.data);
  const issues = toValidationIssues(result.error);
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The Approval Record contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again; never invent human decisions.",
      target: { logicalId: "approval-record", type: "approval" },
    }),
  );
}

export function approvalStatusErrorCode(
  status: ApprovalStatus,
): ErrorCode | null {
  switch (status) {
    case "approved":
      return null;
    case "changes_requested":
      return "APPROVAL_CHANGES_REQUESTED";
    case "draft":
      return "APPROVAL_REQUIRED";
    case "in_review":
      return "APPROVAL_INCOMPLETE";
    case "rejected":
      return "APPROVAL_REJECTED";
    case "revoked":
      return "APPROVAL_REVOKED";
    case "superseded":
      return "APPROVAL_SUPERSEDED";
  }
}

function approvalUseError(
  code: ErrorCode,
  expected: ApprovalUseSubject,
  message: string,
  recoveryInstruction: string,
  missingConditions: readonly string[] = [],
): ReturnType<typeof createToolkitError> {
  return createToolkitError({
    code,
    ...(missingConditions.length === 0
      ? {}
      : { context: { missingConditions } }),
    message,
    recoveryInstruction,
    target: {
      logicalId: `${expected.projectId}/${expected.type}/${expected.assetId}`,
      type: expected.type === "token-set" ? "token-set" : expected.type,
      version: expected.assetVersion,
    },
  });
}

export function checkApprovalForUse(
  approvals: readonly ApprovalRecord[],
  expected: ApprovalUseSubject,
): ReturnType<typeof createToolkitError> | null {
  const matching = approvals.filter(
    ({ approvalId }) => approvalId === expected.approvalId,
  );
  if (matching.length === 0) {
    return approvalUseError(
      "APPROVAL_REQUIRED",
      expected,
      `Approval '${expected.approvalId}' was not found.`,
      "Submit the exact asset version for human review and wait for a valid Approval Record.",
      ["approval_record"],
    );
  }
  if (matching.length > 1) {
    return approvalUseError(
      "IDENTITY_CONFLICT",
      expected,
      `Approval '${expected.approvalId}' is defined more than once.`,
      "Resolve the duplicate Approval identities in Git before any Figma write.",
    );
  }

  const root = matching[0];
  if (root === undefined) {
    return approvalUseError(
      "INTERNAL_ERROR",
      expected,
      "The Approval lookup produced an invalid internal state.",
      "Report the local verifier failure before retrying.",
    );
  }
  if (
    root.subject.projectId !== expected.projectId ||
    root.subject.type !== expected.type ||
    root.subject.assetId !== expected.assetId ||
    root.subject.assetVersion !== expected.assetVersion ||
    root.subject.contentDigest !== expected.contentDigest
  ) {
    return approvalUseError(
      "APPROVAL_STALE",
      expected,
      "The Approval Record does not match the requested asset identity, version, or content digest.",
      "Recompute the current content digest and submit the exact version for human review.",
      ["matching_subject_identity", "matching_content_digest"],
    );
  }

  const duplicateId = approvals.find(
    (approval, index) =>
      approvals.findIndex(
        (candidate) => candidate.approvalId === approval.approvalId,
      ) !== index,
  )?.approvalId;
  if (duplicateId !== undefined) {
    return approvalUseError(
      "IDENTITY_CONFLICT",
      expected,
      `Approval '${duplicateId}' is defined more than once in the dependency catalog.`,
      "Resolve every duplicate Approval identity in Git before any formal write.",
    );
  }

  const statusCode = approvalStatusErrorCode(root.status);
  if (statusCode !== null) {
    const missingRoles = root.policy.requiredRoles.filter(
      (role) =>
        !root.decisions.some(
          (decision) =>
            decision.role === role && decision.decision === "approved",
        ),
    );
    const missingChecks = root.policy.requiredValidationChecks.filter(
      (check) =>
        !root.validations.some(
          (validation) =>
            validation.check === check &&
            validation.priority === "P0" &&
            validation.status === "passed",
        ),
    );
    return approvalUseError(
      statusCode,
      expected,
      `Approval '${root.approvalId}' is ${root.status} and cannot authorize a formal write.`,
      "Follow the Approval Record state and recovery action before retrying the same asset version.",
      [
        ...missingRoles.map((role) => `role:${role}`),
        ...missingChecks.map((check) => `validation:${check}`),
      ],
    );
  }

  const byId = new Map(
    approvals.map((approval) => [approval.approvalId, approval]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const verifyDependencies = (approval: ApprovalRecord): string | null => {
    if (visited.has(approval.approvalId)) return null;
    if (visiting.has(approval.approvalId)) {
      return `dependency_cycle:${approval.approvalId}`;
    }
    visiting.add(approval.approvalId);
    for (const dependency of approval.dependencies) {
      if (dependency.approvalId === null) continue;
      const dependencyApproval = byId.get(dependency.approvalId);
      if (dependencyApproval === undefined) {
        return `dependency_missing:${dependency.approvalId}`;
      }
      if (
        dependencyApproval.subject.projectId !== dependency.projectId ||
        dependencyApproval.subject.type !== dependency.type ||
        dependencyApproval.subject.assetId !== dependency.assetId ||
        dependencyApproval.subject.assetVersion !== dependency.assetVersion ||
        dependencyApproval.subject.contentDigest !== dependency.contentDigest
      ) {
        return `dependency_subject_mismatch:${dependency.approvalId}`;
      }
      if (dependencyApproval.status !== "approved") {
        return `dependency_${dependencyApproval.status}:${dependency.approvalId}`;
      }
      const nestedFailure = verifyDependencies(dependencyApproval);
      if (nestedFailure !== null) return nestedFailure;
    }
    visiting.delete(approval.approvalId);
    visited.add(approval.approvalId);
    return null;
  };
  const dependencyFailure = verifyDependencies(root);
  return dependencyFailure === null
    ? null
    : approvalUseError(
        "APPROVAL_STALE",
        expected,
        "An upstream Approval dependency is missing, inactive, cyclic, or no longer matches its reviewed content.",
        "Restore the exact approved dependency chain or resubmit the downstream asset for review.",
        [dependencyFailure],
      );
}
