import * as z from "zod";

import {
  componentResolveQuerySchema,
  resolveComponent,
  searchComponents,
  type ComponentResolution,
  type ComponentSearchItem,
  type NormalizedComponentResolveQuery,
} from "./component-query.js";
import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import type { JsonObject, JsonValue } from "./json.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import {
  getProvidedSchemaVersion,
  toJsonPointer,
  toValidationIssues,
  type SchemaValidationIssue,
} from "./schema-validation.js";

export const COMPONENT_CHANGE_REQUEST_SCHEMA_VERSION = "1.0.0" as const;
export const COMPONENT_CHANGE_REQUEST_TYPE =
  "component-change-request" as const;
export const COMPONENT_CHANGE_REQUEST_STATUS = "proposed" as const;
export const COMPONENT_CHANGE_KINDS = [
  "create-component",
  "extend-component",
  "review-component-availability",
] as const;
export const COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS = [
  "create-visual-approximation",
  "fallback-to-inactive-component",
  "invent-unregistered-property-or-variant",
  "enqueue-figma-write",
] as const;
export const COMPONENT_CHANGE_REQUEST_VARIANT_ISSUE_CODES = [
  "unknown_variant_property",
  "unsupported_variant_option",
  "variant_not_registered",
] as const;

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

const relativeSourcePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      value
        .split("/")
        .every(
          (segment) =>
            segment.length > 0 && segment !== "." && segment !== "..",
        ),
    { message: "Must be a normalized relative POSIX source path." },
  );

const variantSelectionsSchema = z
  .record(stableIdSegmentSchema, stableIdSegmentSchema)
  .refine((value) => Object.keys(value).length <= 32, {
    message: "Must contain at most 32 Variant selections.",
  });

export const componentChangeRequestSubmissionSchema = z.strictObject({
  intendedUse: requiredText(2_000),
  rationale: requiredText(2_000),
  requestId: z.uuid(),
  requestVersion: strictSemverSchema.default("1.0.0"),
  submittedAt: z.iso.datetime({ offset: true }),
  submittedBy: z.strictObject({
    id: stableAssetIdSchema,
    type: z.enum(["agent", "human"]),
  }),
  summary: requiredText(240),
});

const changeRequestTargetSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetType: z.literal("component"),
  requestedVersion: strictSemverSchema.nullable(),
});

const existingCandidateSchema = z.strictObject({
  approvalId: requiredText(320),
  asset: z.strictObject({
    contentDigest: contentDigestSchema,
    id: stableAssetIdSchema,
    version: strictSemverSchema,
  }),
  figmaStatus: z.enum(["ready", "unbuilt"]),
  lifecycle: z.enum(["active", "revoked", "superseded"]),
  sources: z.strictObject({
    contractSourcePath: relativeSourcePathSchema,
    registrySourcePath: relativeSourcePathSchema,
  }),
});

const resolutionIssueSchema = z.strictObject({
  code: z.enum(COMPONENT_CHANGE_REQUEST_VARIANT_ISSUE_CODES),
  message: requiredText(2_000),
  path: z.string().min(1).max(1_024).startsWith("/"),
});

const sourceQuerySchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.nullable(),
  projectId: stableIdSegmentSchema,
  variantSelections: variantSelectionsSchema,
});

export const componentChangeRequestSchema = z
  .strictObject({
    changeKind: z.enum(COMPONENT_CHANGE_KINDS),
    contentDigest: contentDigestSchema.optional(),
    existingCandidates: z.array(existingCandidateSchema).max(100),
    intendedUse: requiredText(2_000),
    nextAction: z.literal("human-triage"),
    prohibitedActions: z.tuple([
      z.literal(COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS[0]),
      z.literal(COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS[1]),
      z.literal(COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS[2]),
      z.literal(COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS[3]),
    ]),
    projectId: stableIdSegmentSchema,
    rationale: requiredText(2_000),
    requestId: z.uuid(),
    requestType: z.literal(COMPONENT_CHANGE_REQUEST_TYPE),
    requestVersion: strictSemverSchema,
    resolutionEvidence: z.strictObject({
      errorCode: z.enum(["IDENTITY_NOT_FOUND", "VALIDATION_FAILED"]),
      issues: z.array(resolutionIssueSchema).max(100),
    }),
    schemaVersion: z.literal(COMPONENT_CHANGE_REQUEST_SCHEMA_VERSION),
    sourceQuery: sourceQuerySchema,
    status: z.literal(COMPONENT_CHANGE_REQUEST_STATUS),
    submission: z.strictObject({
      submittedAt: z.iso.datetime({ offset: true }),
      submittedBy: z.strictObject({
        id: stableAssetIdSchema,
        type: z.enum(["agent", "human"]),
      }),
    }),
    summary: requiredText(240),
    target: changeRequestTargetSchema,
  })
  .superRefine((request, context) => {
    if (request.sourceQuery.projectId !== request.projectId) {
      context.addIssue({
        code: "custom",
        message: "Source query and Change Request must belong to one project.",
        path: ["sourceQuery", "projectId"],
      });
    }
    if (request.sourceQuery.assetId !== request.target.assetId) {
      context.addIssue({
        code: "custom",
        message:
          "Source query and Change Request target must use one asset ID.",
        path: ["target", "assetId"],
      });
    }
    if (request.sourceQuery.assetVersion !== request.target.requestedVersion) {
      context.addIssue({
        code: "custom",
        message:
          "Source query and Change Request target must use one requested version.",
        path: ["target", "requestedVersion"],
      });
    }
    request.existingCandidates.forEach((candidate, index) => {
      if (candidate.asset.id !== request.target.assetId) {
        context.addIssue({
          code: "custom",
          message: "Existing candidate must match the target asset ID.",
          path: ["existingCandidates", index, "asset", "id"],
        });
      }
    });
    const seenCandidates = new Set<string>();
    request.existingCandidates.forEach((candidate, index) => {
      const identity = `${candidate.asset.id}@${candidate.asset.version}`;
      if (seenCandidates.has(identity)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate existing candidate '${identity}'.`,
          path: ["existingCandidates", index, "asset", "version"],
        });
      }
      seenCandidates.add(identity);
    });
    if (
      request.resolutionEvidence.errorCode === "IDENTITY_NOT_FOUND" &&
      request.resolutionEvidence.issues.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Identity Not Found evidence must not contain Variant issues.",
        path: ["resolutionEvidence", "issues"],
      });
    }
    if (
      request.resolutionEvidence.errorCode === "VALIDATION_FAILED" &&
      request.resolutionEvidence.issues.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Validation evidence must contain at least one issue.",
        path: ["resolutionEvidence", "issues"],
      });
    }
    if (
      request.changeKind === "create-component" &&
      request.existingCandidates.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A create-component request must not hide existing registered candidates.",
        path: ["changeKind"],
      });
    }
    if (
      request.changeKind === "extend-component" &&
      request.resolutionEvidence.errorCode !== "VALIDATION_FAILED"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "An extend-component request requires Variant validation evidence.",
        path: ["resolutionEvidence", "errorCode"],
      });
    }
    if (
      request.changeKind !== "extend-component" &&
      request.resolutionEvidence.errorCode !== "IDENTITY_NOT_FOUND"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Create and availability requests require Identity Not Found evidence.",
        path: ["resolutionEvidence", "errorCode"],
      });
    }
    if (
      request.changeKind === "extend-component" &&
      !request.existingCandidates.some(
        (candidate) => candidate.lifecycle === "active",
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "An extend-component request requires an Active candidate.",
        path: ["changeKind"],
      });
    }
    if (
      request.changeKind === "review-component-availability" &&
      request.existingCandidates.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "An availability review requires at least one existing candidate.",
        path: ["changeKind"],
      });
    }
  });

export type ComponentChangeRequest = z.infer<
  typeof componentChangeRequestSchema
>;
export type ComponentChangeRequestSubmission = z.input<
  typeof componentChangeRequestSubmissionSchema
>;
export type ComponentChangeRequestDigestSubject = Omit<
  ComponentChangeRequest,
  "contentDigest" | "submission"
> & {
  readonly submission: Pick<
    ComponentChangeRequest["submission"],
    "submittedBy"
  >;
};

export interface ResolvedComponentOutcome {
  readonly outcome: "resolved";
  readonly resolution: ComponentResolution;
}

export interface ComponentChangeRequestOutcome {
  readonly changeRequest: ComponentChangeRequest;
  readonly outcome: "change-request-required";
}

export type ComponentResolutionOutcome =
  ComponentChangeRequestOutcome | ResolvedComponentOutcome;

function validationFailure(
  issues: readonly SchemaValidationIssue[],
  message: string,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and try again.",
      target: { logicalId: "component-change-request", type: "component" },
    }),
  );
}

export function validateComponentChangeRequest(
  input: unknown,
): ToolkitResult<ComponentChangeRequest> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== COMPONENT_CHANGE_REQUEST_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: {
            schemaVersion: COMPONENT_CHANGE_REQUEST_SCHEMA_VERSION,
          },
        },
        message: "The Component Change Request schema version is unsupported.",
        recoveryInstruction:
          "Use Component Change Request schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "component-change-request-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }
  const result = componentChangeRequestSchema.safeParse(input);
  if (result.success) {
    return createSuccessResult(result.data);
  }
  const issues = toValidationIssues(result.error);
  return validationFailure(
    issues,
    `The Component Change Request contains ${String(issues.length)} validation issue(s).`,
  );
}

export function toComponentChangeRequestDigestSubject(
  request: ComponentChangeRequest,
): ComponentChangeRequestDigestSubject {
  return {
    changeKind: request.changeKind,
    existingCandidates: request.existingCandidates,
    intendedUse: request.intendedUse,
    nextAction: request.nextAction,
    prohibitedActions: request.prohibitedActions,
    projectId: request.projectId,
    rationale: request.rationale,
    requestId: request.requestId,
    requestType: request.requestType,
    requestVersion: request.requestVersion,
    resolutionEvidence: request.resolutionEvidence,
    schemaVersion: request.schemaVersion,
    sourceQuery: request.sourceQuery,
    status: request.status,
    submission: { submittedBy: request.submission.submittedBy },
    summary: request.summary,
    target: request.target,
  };
}

interface ResolutionIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractResolutionIssues(
  value: JsonValue | undefined,
): readonly ResolutionIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const issues: ResolutionIssue[] = [];
  for (const item of value) {
    if (!isJsonObject(item)) {
      continue;
    }
    if (
      typeof item.code === "string" &&
      typeof item.message === "string" &&
      typeof item.path === "string"
    ) {
      issues.push({
        code: item.code,
        message: item.message,
        path: item.path,
      });
    }
  }
  return issues;
}

const CHANGE_REQUEST_VARIANT_ISSUE_CODE_SET = new Set<string>(
  COMPONENT_CHANGE_REQUEST_VARIANT_ISSUE_CODES,
);

function toExistingCandidate(
  item: ComponentSearchItem,
): ComponentChangeRequest["existingCandidates"][number] {
  return {
    approvalId: item.approvalId,
    asset: {
      contentDigest: item.asset.contentDigest,
      id: item.asset.id,
      version: item.asset.version,
    },
    figmaStatus: item.figmaStatus,
    lifecycle: item.lifecycle,
    sources: item.sources,
  };
}

function requestConstructionFailure(): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "INTERNAL_ERROR",
      message: "A valid Component Change Request could not be constructed.",
      recoveryInstruction:
        "Inspect the validated resolution query and report this toolkit defect.",
      target: { logicalId: "component-change-request", type: "component" },
    }),
  );
}

function createChangeRequest(
  query: NormalizedComponentResolveQuery,
  submission: z.output<typeof componentChangeRequestSubmissionSchema>,
  errorCode: "IDENTITY_NOT_FOUND" | "VALIDATION_FAILED",
  issues: readonly ResolutionIssue[],
  existingItems: readonly ComponentSearchItem[],
): ToolkitResult<ComponentChangeRequest> {
  const existingCandidates = existingItems.map(toExistingCandidate);
  const changeKind =
    errorCode === "VALIDATION_FAILED"
      ? "extend-component"
      : existingCandidates.length === 0
        ? "create-component"
        : "review-component-availability";
  const requestResult = componentChangeRequestSchema.safeParse({
    changeKind,
    existingCandidates,
    intendedUse: submission.intendedUse,
    nextAction: "human-triage",
    prohibitedActions: COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS,
    projectId: query.projectId,
    rationale: submission.rationale,
    requestId: submission.requestId,
    requestType: COMPONENT_CHANGE_REQUEST_TYPE,
    requestVersion: submission.requestVersion,
    resolutionEvidence: { errorCode, issues },
    schemaVersion: COMPONENT_CHANGE_REQUEST_SCHEMA_VERSION,
    sourceQuery: {
      assetId: query.assetId,
      assetVersion: query.assetVersion ?? null,
      projectId: query.projectId,
      variantSelections: query.variantSelections,
    },
    status: COMPONENT_CHANGE_REQUEST_STATUS,
    submission: {
      submittedAt: submission.submittedAt,
      submittedBy: submission.submittedBy,
    },
    summary: submission.summary,
    target: {
      assetId: query.assetId,
      assetType: "component",
      requestedVersion: query.assetVersion ?? null,
    },
  });
  return requestResult.success
    ? createSuccessResult(requestResult.data)
    : requestConstructionFailure();
}

export function resolveComponentOrRequestChange(
  snapshot: DesignSystemSnapshot,
  queryInput: unknown,
  submissionInput: unknown,
): ToolkitResult<ComponentResolutionOutcome> {
  const queryResult = componentResolveQuerySchema.safeParse(queryInput);
  if (!queryResult.success) {
    return validationFailure(
      toValidationIssues(queryResult.error),
      "The Component resolve query is not valid enough to create a Change Request.",
    );
  }
  const submissionResult =
    componentChangeRequestSubmissionSchema.safeParse(submissionInput);
  if (!submissionResult.success) {
    return validationFailure(
      toValidationIssues(submissionResult.error).map((issue) => ({
        ...issue,
        path: toJsonPointer(["submission", ...issue.path.split("/").slice(1)]),
      })),
      "The Component Change Request submission is invalid.",
    );
  }

  const resolutionResult = resolveComponent(snapshot, queryResult.data);
  if (resolutionResult.ok) {
    return createSuccessResult(
      { outcome: "resolved", resolution: resolutionResult.data },
      resolutionResult.warnings,
    );
  }
  if (queryResult.data.projectId !== snapshot.projectId) {
    return resolutionResult;
  }

  let errorCode: "IDENTITY_NOT_FOUND" | "VALIDATION_FAILED";
  let issues: readonly ResolutionIssue[];
  if (resolutionResult.error.code === "IDENTITY_NOT_FOUND") {
    errorCode = "IDENTITY_NOT_FOUND";
    issues = [];
  } else if (resolutionResult.error.code === "VALIDATION_FAILED") {
    issues = extractResolutionIssues(
      resolutionResult.error.context?.details?.issues,
    );
    if (
      issues.length === 0 ||
      !issues.every((issue) =>
        CHANGE_REQUEST_VARIANT_ISSUE_CODE_SET.has(issue.code),
      )
    ) {
      return resolutionResult;
    }
    errorCode = "VALIDATION_FAILED";
  } else {
    return resolutionResult;
  }

  const searchResult = searchComponents(snapshot, {
    assetId: queryResult.data.assetId,
    lifecycle: "any",
    projectId: queryResult.data.projectId,
  });
  if (!searchResult.ok) {
    return searchResult;
  }
  const changeRequestResult = createChangeRequest(
    queryResult.data,
    submissionResult.data,
    errorCode,
    issues,
    searchResult.data.items,
  );
  if (!changeRequestResult.ok) {
    return changeRequestResult;
  }
  return createSuccessResult(
    {
      changeRequest: changeRequestResult.data,
      outcome: "change-request-required",
    },
    [
      {
        code: "COMPONENT_CHANGE_REQUEST_REQUIRED",
        details: {
          changeKind: changeRequestResult.data.changeKind,
          requestId: changeRequestResult.data.requestId,
        },
        message:
          "The exact Component request cannot continue until a human triages the generated Change Request.",
        target: {
          logicalId: changeRequestResult.data.target.assetId,
          type: "component",
          ...(changeRequestResult.data.target.requestedVersion === null
            ? {}
            : {
                version: changeRequestResult.data.target.requestedVersion,
              }),
        },
      },
    ],
  );
}
