import * as z from "zod";

import { createToolkitError } from "./errors.js";
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

export const DIRECTION_REVIEW_SCHEMA_VERSION = "1.0.0" as const;
export const DIRECTION_REVIEW_ASSET_TYPE = "direction" as const;
export const DIRECTION_REVIEW_REQUIRED_ROLES = [
  "product_owner",
  "design_owner",
] as const;
export const DIRECTION_REVIEW_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "rejected",
  "selected",
] as const;
export const DIRECTION_DENSITIES = ["compact", "balanced", "relaxed"] as const;

export type DirectionReviewStatus = (typeof DIRECTION_REVIEW_STATUSES)[number];

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
const colorValueSchema = requiredText(64).regex(
  /^(?:#[a-fA-F0-9]{6}|#[a-fA-F0-9]{8}|oklch\(.+\))$/u,
  "Color must use six/eight-digit hexadecimal or OKLCH notation.",
);

const briefSourceSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema,
  contentDigest: contentDigestSchema,
  projectId: stableIdSegmentSchema,
  type: z.literal("brief"),
});

const previewSchema = z.strictObject({
  altText: requiredText(500),
  scenarioId: stableIdSegmentSchema,
  title: requiredText(120),
  uri: evidenceUriSchema,
});

const candidateSchema = z.strictObject({
  accessibilityPlan: z.array(requiredText(500)).min(2).max(12),
  benefits: z.array(requiredText(500)).min(2).max(12),
  colorStrategy: z.strictObject({
    palette: z
      .array(
        z.strictObject({
          rationale: requiredText(500),
          role: stableIdSegmentSchema,
          value: colorValueSchema,
        }),
      )
      .min(4)
      .max(16),
    rationale: requiredText(1_000),
  }),
  density: z.strictObject({
    rationale: requiredText(1_000),
    scale: z.enum(DIRECTION_DENSITIES),
    spacingExamples: z.array(z.number().int().min(2).max(128)).min(4).max(12),
  }),
  designRationale: requiredText(2_000),
  differentiation: requiredText(1_000),
  graphicLanguage: requiredText(1_000),
  iconography: requiredText(1_000),
  id: stableIdSegmentSchema,
  motion: requiredText(1_000),
  name: requiredText(120),
  preview: previewSchema,
  radius: z.strictObject({
    examples: z.array(z.number().int().min(0).max(128)).min(3).max(8),
    strategy: requiredText(1_000),
  }),
  risks: z.array(requiredText(500)).min(2).max(12),
  typography: z.strictObject({
    body: requiredText(120),
    heading: requiredText(120),
    rationale: requiredText(1_000),
  }),
});

const directionDecisionSchema = z.strictObject({
  candidateId: stableIdSegmentSchema.nullable(),
  decidedAt: z.iso.datetime({ offset: true }),
  decision: z.enum(["selected", "changes_requested", "rejected"]),
  reviewer: humanIdentitySchema,
  role: z.enum(DIRECTION_REVIEW_REQUIRED_ROLES),
  summary: requiredText(1_000),
});

const directionReviewBaseSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetType: z.literal(DIRECTION_REVIEW_ASSET_TYPE),
  assetVersion: strictSemverSchema,
  briefSource: briefSourceSchema,
  candidates: z.array(candidateSchema).length(3),
  comparisonScenario: z.strictObject({
    description: requiredText(1_000),
    id: stableIdSegmentSchema,
    requiredElements: z.array(stableIdSegmentSchema).min(3).max(12),
    title: requiredText(120),
  }),
  contentDigest: contentDigestSchema.optional(),
  projectId: stableIdSegmentSchema,
  schemaVersion: z.literal(DIRECTION_REVIEW_SCHEMA_VERSION),
  selection: z.strictObject({
    decisions: z.array(directionDecisionSchema).max(2),
    selectedCandidateId: stableIdSegmentSchema.nullable(),
    status: z.enum(DIRECTION_REVIEW_STATUSES),
    submission: z.strictObject({
      submittedAt: z.iso.datetime({ offset: true }).nullable(),
      submittedBy: actorIdentitySchema,
    }),
  }),
  summary: requiredText(500),
  title: requiredText(120),
});

type DirectionReviewBase = z.infer<typeof directionReviewBaseSchema>;

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function addIssue(
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

export function deriveDirectionReviewSelection(review: DirectionReviewBase): {
  readonly selectedCandidateId: string | null;
  readonly status: DirectionReviewStatus;
} {
  if (review.selection.submission.submittedAt === null) {
    return { selectedCandidateId: null, status: "draft" };
  }
  if (
    review.selection.decisions.some(({ decision }) => decision === "rejected")
  ) {
    return { selectedCandidateId: null, status: "rejected" };
  }
  if (
    review.selection.decisions.some(
      ({ decision }) => decision === "changes_requested",
    )
  ) {
    return { selectedCandidateId: null, status: "changes_requested" };
  }
  const decisionsByRole = new Map(
    review.selection.decisions.map((decision) => [decision.role, decision]),
  );
  const selectedIds = DIRECTION_REVIEW_REQUIRED_ROLES.map(
    (role) => decisionsByRole.get(role)?.candidateId,
  );
  const selectedCandidateId = selectedIds[0];
  if (
    selectedIds.every(
      (candidateId) =>
        candidateId !== undefined && candidateId === selectedCandidateId,
    ) &&
    selectedCandidateId !== undefined &&
    selectedCandidateId !== null
  ) {
    return { selectedCandidateId, status: "selected" };
  }
  return { selectedCandidateId: null, status: "in_review" };
}

export const directionReviewSchema = directionReviewBaseSchema.superRefine(
  (review, context) => {
    if (review.briefSource.projectId !== review.projectId) {
      addIssue(
        context,
        ["briefSource", "projectId"],
        "Brief source must belong to the same project as the Direction Review.",
      );
    }

    if (!hasUniqueValues(review.candidates.map(({ id }) => id))) {
      addIssue(context, ["candidates"], "Candidate IDs must be unique.");
    }
    if (!hasUniqueValues(review.candidates.map(({ name }) => name))) {
      addIssue(context, ["candidates"], "Candidate names must be unique.");
    }
    if (
      !hasUniqueValues(review.comparisonScenario.requiredElements) ||
      review.candidates.some(
        ({ preview }) => preview.scenarioId !== review.comparisonScenario.id,
      )
    ) {
      addIssue(
        context,
        ["comparisonScenario"],
        "Required elements must be unique and every candidate must preview the exact same scenario.",
      );
    }
    review.candidates.forEach((candidate, candidateIndex) => {
      const roles = candidate.colorStrategy.palette.map(({ role }) => role);
      if (!hasUniqueValues(roles)) {
        addIssue(
          context,
          ["candidates", candidateIndex, "colorStrategy", "palette"],
          "Color roles must be unique within a candidate.",
        );
      }
      if (!hasUniqueValues(candidate.density.spacingExamples.map(String))) {
        addIssue(
          context,
          ["candidates", candidateIndex, "density", "spacingExamples"],
          "Spacing examples must be unique.",
        );
      }
      if (!hasUniqueValues(candidate.radius.examples.map(String))) {
        addIssue(
          context,
          ["candidates", candidateIndex, "radius", "examples"],
          "Radius examples must be unique.",
        );
      }
    });

    const decisionRoles = review.selection.decisions.map(({ role }) => role);
    if (!hasUniqueValues(decisionRoles)) {
      addIssue(
        context,
        ["selection", "decisions"],
        "Each required role may record only one current decision.",
      );
    }
    const candidateIds = new Set(review.candidates.map(({ id }) => id));
    review.selection.decisions.forEach((decision, decisionIndex) => {
      if (
        decision.decision === "selected" &&
        (decision.candidateId === null ||
          !candidateIds.has(decision.candidateId))
      ) {
        addIssue(
          context,
          ["selection", "decisions", decisionIndex, "candidateId"],
          "A selected decision must reference one candidate in this review.",
        );
      }
      if (decision.decision !== "selected" && decision.candidateId !== null) {
        addIssue(
          context,
          ["selection", "decisions", decisionIndex, "candidateId"],
          "Only a selected decision may reference a candidate.",
        );
      }
      if (
        review.selection.submission.submittedAt !== null &&
        Date.parse(decision.decidedAt) <
          Date.parse(review.selection.submission.submittedAt)
      ) {
        addIssue(
          context,
          ["selection", "decisions", decisionIndex, "decidedAt"],
          "A decision cannot predate submission.",
        );
      }
    });
    if (
      review.selection.submission.submittedAt === null &&
      review.selection.decisions.length > 0
    ) {
      addIssue(
        context,
        ["selection", "decisions"],
        "A draft review cannot contain human decisions before submission.",
      );
    }

    const derived = deriveDirectionReviewSelection(review);
    if (review.selection.status !== derived.status) {
      addIssue(
        context,
        ["selection", "status"],
        `Selection status must be derived as '${derived.status}'.`,
      );
    }
    if (review.selection.selectedCandidateId !== derived.selectedCandidateId) {
      addIssue(
        context,
        ["selection", "selectedCandidateId"],
        derived.selectedCandidateId === null
          ? "No candidate may be stored as selected in the current state."
          : `Selected candidate must be '${derived.selectedCandidateId}'.`,
      );
    }
  },
);

export type DirectionReview = z.infer<typeof directionReviewSchema>;

export interface DirectionReviewDraftInput {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly briefSource: DirectionReview["briefSource"];
  readonly candidates: DirectionReview["candidates"];
  readonly comparisonScenario: DirectionReview["comparisonScenario"];
  readonly projectId: string;
  readonly submittedBy: string;
  readonly summary: string;
  readonly title: string;
}

export function createDirectionReviewDraft(
  input: DirectionReviewDraftInput,
): ToolkitResult<DirectionReview> {
  return validateDirectionReview({
    assetId: input.assetId,
    assetType: DIRECTION_REVIEW_ASSET_TYPE,
    assetVersion: input.assetVersion,
    briefSource: input.briefSource,
    candidates: input.candidates,
    comparisonScenario: input.comparisonScenario,
    projectId: input.projectId,
    schemaVersion: DIRECTION_REVIEW_SCHEMA_VERSION,
    selection: {
      decisions: [],
      selectedCandidateId: null,
      status: "draft",
      submission: { submittedAt: null, submittedBy: input.submittedBy },
    },
    summary: input.summary,
    title: input.title,
  });
}

export function toDirectionReviewDigestSubject(
  review: DirectionReview,
): Omit<DirectionReview, "contentDigest"> {
  const { contentDigest: _contentDigest, ...subject } = review;
  void _contentDigest;
  return subject;
}

function unsupportedSchemaFailure(actual: {
  readonly schemaVersion: string;
}): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "SCHEMA_VERSION_UNSUPPORTED",
      context: {
        actual,
        expected: { schemaVersion: DIRECTION_REVIEW_SCHEMA_VERSION },
      },
      message: "The Direction Review schema version is not supported.",
      recoveryInstruction:
        "Migrate the Direction Review to the supported schema version and retry.",
      target: { logicalId: "direction-review", type: "direction" },
    }),
  );
}

function validationFailure(
  issues: readonly SchemaValidationIssue[],
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The Direction Review contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again.",
      target: { logicalId: "direction-review", type: "direction" },
    }),
  );
}

export function validateDirectionReview(
  value: unknown,
): ToolkitResult<DirectionReview> {
  const providedVersion = getProvidedSchemaVersion(value);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== DIRECTION_REVIEW_SCHEMA_VERSION
  ) {
    return unsupportedSchemaFailure(providedVersion);
  }
  const result = directionReviewSchema.safeParse(value);
  return result.success
    ? createSuccessResult(result.data)
    : validationFailure(toValidationIssues(result.error));
}
