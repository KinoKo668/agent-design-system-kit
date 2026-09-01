import type { ZodError } from "zod";

import {
  approvalRecordSchema,
  type ApprovalRecord,
} from "./approval-record.js";
import {
  buttonComponentContractSchema,
  toButtonComponentContractDigestSubject,
  validateButtonComponentContractWithTokenSet,
  type ButtonComponentContract,
} from "./button-contract.js";
import {
  componentRegistrySchema,
  type ComponentRegistry,
} from "./component-registry.js";
import {
  designBriefSchema,
  toDesignBriefDigestSubject,
  type DesignBrief,
} from "./design-brief.js";
import {
  directionReviewSchema,
  toDirectionReviewDigestSubject,
  type DirectionReview,
} from "./direction-review.js";
import { createToolkitError } from "./errors.js";
import type { JsonObject, JsonValue } from "./json.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import { stableIdSegmentSchema } from "./schema-primitives.js";
import { compareSemanticVersions } from "./semantic-version.js";
import { toJsonPointer, toValidationIssues } from "./schema-validation.js";
import {
  tokenSetSchema,
  toTokenSetDigestSubject,
  type TokenSet,
} from "./token-set.js";

export const DESIGN_SYSTEM_DOCUMENT_KINDS = [
  "approval",
  "brief",
  "component",
  "component-registry",
  "direction",
  "token-set",
] as const;

export type DesignSystemDocumentKind =
  (typeof DESIGN_SYSTEM_DOCUMENT_KINDS)[number];

export interface DesignSystemSourceDocument {
  readonly kind: DesignSystemDocumentKind;
  readonly sourcePath: string;
  readonly value: unknown;
}

export interface LocatedDesignAsset<T> {
  readonly data: T;
  readonly sourcePath: string;
}

export interface DesignSystemSnapshot {
  readonly approvals: readonly LocatedDesignAsset<ApprovalRecord>[];
  readonly briefs: readonly LocatedDesignAsset<DesignBrief>[];
  readonly components: readonly LocatedDesignAsset<ButtonComponentContract>[];
  readonly directions: readonly LocatedDesignAsset<DirectionReview>[];
  readonly projectId: string;
  readonly registries: readonly LocatedDesignAsset<ComponentRegistry>[];
  readonly tokenSets: readonly LocatedDesignAsset<TokenSet>[];
}

export type JsonContentDigestCalculator = (value: unknown) => string;

export interface DesignSystemIntegrityIssue extends JsonObject {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly relatedSourcePath?: string;
  readonly sourcePath: string;
}

interface MutableSnapshot {
  readonly approvals: LocatedDesignAsset<ApprovalRecord>[];
  readonly briefs: LocatedDesignAsset<DesignBrief>[];
  readonly components: LocatedDesignAsset<ButtonComponentContract>[];
  readonly directions: LocatedDesignAsset<DirectionReview>[];
  readonly registries: LocatedDesignAsset<ComponentRegistry>[];
  readonly tokenSets: LocatedDesignAsset<TokenSet>[];
}

function isSafeRelativeSourcePath(sourcePath: string): boolean {
  if (
    sourcePath.length === 0 ||
    sourcePath.length > 1_024 ||
    sourcePath.startsWith("/") ||
    sourcePath.includes("\\") ||
    sourcePath.includes("\0")
  ) {
    return false;
  }
  const segments = sourcePath.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function addZodIssues(
  issues: DesignSystemIntegrityIssue[],
  sourcePath: string,
  error: ZodError,
): void {
  for (const issue of toValidationIssues(error)) {
    issues.push({ ...issue, sourcePath });
  }
}

function addProjectMismatch(
  issues: DesignSystemIntegrityIssue[],
  expectedProjectId: string,
  sourcePath: string,
  actualProjectId: string,
): void {
  if (actualProjectId !== expectedProjectId) {
    issues.push({
      code: "project_mismatch",
      message: `Document project '${actualProjectId}' does not match expected project '${expectedProjectId}'.`,
      path: "/projectId",
      sourcePath,
    });
  }
}

function addDuplicateAssetIssues<
  T extends { readonly data: object; readonly sourcePath: string },
>(
  assets: readonly T[],
  identity: (asset: T) => string,
  issues: DesignSystemIntegrityIssue[],
): void {
  const sources = new Map<string, string>();
  for (const asset of assets) {
    const key = identity(asset);
    const previousSource = sources.get(key);
    if (previousSource !== undefined) {
      issues.push({
        code: "duplicate_asset",
        message: `Asset identity '${key}' is defined by more than one source file.`,
        path: "/assetId",
        relatedSourcePath: previousSource,
        sourcePath: asset.sourcePath,
      });
    } else {
      sources.set(key, asset.sourcePath);
    }
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractValidationIssues(value: JsonValue | undefined): readonly {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const issues: Array<{ code: string; message: string; path: string }> = [];
  for (const item of value) {
    if (!isJsonObject(item)) {
      continue;
    }
    const code = item.code;
    const message = item.message;
    const path = item.path;
    if (
      typeof code === "string" &&
      typeof message === "string" &&
      typeof path === "string"
    ) {
      issues.push({ code, message, path });
    }
  }
  return issues;
}

function tokenIdentity(tokenSet: TokenSet): string {
  return `${tokenSet.projectId}/token-set/${tokenSet.assetId}@${tokenSet.assetVersion}`;
}

function componentIdentity(component: ButtonComponentContract): string {
  return `${component.projectId}/component/${component.assetId}@${component.assetVersion}`;
}

function briefIdentity(brief: DesignBrief): string {
  return `${brief.projectId}/brief/${brief.assetId}@${brief.assetVersion}`;
}

function directionIdentity(direction: DirectionReview): string {
  return `${direction.projectId}/direction/${direction.assetId}@${direction.assetVersion}`;
}

function approvalIdentity(approval: ApprovalRecord): string {
  return approval.approvalId;
}

function validateDirectionBriefReferences(
  snapshot: Pick<DesignSystemSnapshot, "briefs" | "directions">,
  issues: DesignSystemIntegrityIssue[],
  calculateDigest?: JsonContentDigestCalculator,
): void {
  const briefs = new Map(
    snapshot.briefs.map((located) => [briefIdentity(located.data), located]),
  );
  for (const direction of snapshot.directions) {
    const source = direction.data.briefSource;
    const key = `${source.projectId}/brief/${source.assetId}@${source.assetVersion}`;
    const brief = briefs.get(key);
    if (brief === undefined) {
      issues.push({
        code: "missing_reference",
        message: `Design Brief '${key}' referenced by the Direction Review was not loaded.`,
        path: "/briefSource",
        sourcePath: direction.sourcePath,
      });
      continue;
    }
    if (
      calculateDigest !== undefined &&
      calculateDigest(toDesignBriefDigestSubject(brief.data)) !==
        source.contentDigest
    ) {
      issues.push({
        code: "content_digest_mismatch",
        message:
          "Direction Review briefSource contentDigest does not match the canonical Design Brief.",
        path: "/briefSource/contentDigest",
        relatedSourcePath: brief.sourcePath,
        sourcePath: direction.sourcePath,
      });
    }
  }
}

function validateComponentTokenReferences(
  snapshot: MutableSnapshot,
  issues: DesignSystemIntegrityIssue[],
): void {
  const tokenSets = new Map(
    snapshot.tokenSets.map((located) => [tokenIdentity(located.data), located]),
  );

  for (const component of snapshot.components) {
    const source = component.data.tokenSource;
    const key = `${source.projectId}/token-set/${source.assetId}@${source.assetVersion}`;
    const tokenSet = tokenSets.get(key);
    if (tokenSet === undefined) {
      issues.push({
        code: "missing_reference",
        message: `Token Set '${key}' referenced by the Component Contract was not loaded.`,
        path: "/tokenSource",
        sourcePath: component.sourcePath,
      });
      continue;
    }

    const result = validateButtonComponentContractWithTokenSet(
      component.data,
      tokenSet.data,
    );
    if (result.ok) {
      continue;
    }
    const nestedIssues = extractValidationIssues(
      result.error.context?.details?.issues,
    );
    for (const nestedIssue of nestedIssues) {
      issues.push({
        ...nestedIssue,
        relatedSourcePath: tokenSet.sourcePath,
        sourcePath: component.sourcePath,
      });
    }
  }
}

interface RegistryEntryLocation {
  readonly localEntryIndex: number;
  readonly sourcePath: string;
}

function validateMergedRegistries(
  expectedProjectId: string,
  snapshot: MutableSnapshot,
  issues: DesignSystemIntegrityIssue[],
): void {
  if (snapshot.registries.length < 2) {
    return;
  }
  const entries: ComponentRegistry["entries"][number][] = [];
  const locations: RegistryEntryLocation[] = [];
  for (const registry of snapshot.registries) {
    registry.data.entries.forEach((entry, localEntryIndex) => {
      entries.push(entry);
      locations.push({ localEntryIndex, sourcePath: registry.sourcePath });
    });
  }

  const result = componentRegistrySchema.safeParse({
    entries,
    projectId: expectedProjectId,
    registryType: "component-registry",
    schemaVersion: "1.0.0",
  });
  if (result.success) {
    return;
  }

  for (const issue of result.error.issues) {
    const globalEntryIndex =
      issue.path[0] === "entries" ? issue.path[1] : undefined;
    const location =
      typeof globalEntryIndex === "number"
        ? locations[globalEntryIndex]
        : undefined;
    const localPath =
      location === undefined
        ? issue.path
        : ["entries", location.localEntryIndex, ...issue.path.slice(2)];
    issues.push({
      code: issue.code,
      message: issue.message,
      path: toJsonPointer(localPath),
      sourcePath:
        location?.sourcePath ?? snapshot.registries[0]?.sourcePath ?? ".",
    });
  }
}

function validateRegistryComponentReferences(
  snapshot: MutableSnapshot,
  issues: DesignSystemIntegrityIssue[],
): void {
  const components = new Map(
    snapshot.components.map((located) => [
      componentIdentity(located.data),
      located,
    ]),
  );
  for (const registry of snapshot.registries) {
    registry.data.entries.forEach((entry, entryIndex) => {
      const key = `${registry.data.projectId}/component/${entry.asset.id}@${entry.asset.version}`;
      const component = components.get(key);
      const path = toJsonPointer(["entries", entryIndex, "asset"]);
      if (component === undefined) {
        issues.push({
          code: "missing_reference",
          message: `Component Contract '${key}' referenced by the Registry was not loaded.`,
          path,
          sourcePath: registry.sourcePath,
        });
        return;
      }

      if (component.data.contentDigest === undefined) {
        issues.push({
          code: "missing_content_digest",
          message:
            "A Component Contract must contain contentDigest before it can be registered.",
          path: `${path}/contentDigest`,
          relatedSourcePath: component.sourcePath,
          sourcePath: registry.sourcePath,
        });
      } else if (component.data.contentDigest !== entry.asset.contentDigest) {
        issues.push({
          code: "content_digest_mismatch",
          message:
            "Registry content digest does not match the referenced Component Contract.",
          path: `${path}/contentDigest`,
          relatedSourcePath: component.sourcePath,
          sourcePath: registry.sourcePath,
        });
      }
    });
  }
}

function approvalSubjectIdentity(record: ApprovalRecord): string {
  return `${record.subject.projectId}/${record.subject.type}/${record.subject.assetId}@${record.subject.assetVersion}`;
}

function wasApproved(status: ApprovalRecord["status"]): boolean {
  return ["approved", "revoked", "superseded"].includes(status);
}

function addMissingApprovalReference(
  issues: DesignSystemIntegrityIssue[],
  sourcePath: string,
  path: string,
  identity: string,
): void {
  issues.push({
    code: "missing_reference",
    message: `Approval reference '${identity}' was not loaded.`,
    path,
    sourcePath,
  });
}

function validateApprovalReferences(
  snapshot: DesignSystemSnapshot,
  issues: DesignSystemIntegrityIssue[],
  calculateDigest: JsonContentDigestCalculator,
): void {
  const approvals = new Map(
    snapshot.approvals.map((located) => [located.data.approvalId, located]),
  );
  const briefs = new Map(
    snapshot.briefs.map((located) => [briefIdentity(located.data), located]),
  );
  const tokenSets = new Map(
    snapshot.tokenSets.map((located) => [tokenIdentity(located.data), located]),
  );
  const components = new Map(
    snapshot.components.map((located) => [
      componentIdentity(located.data),
      located,
    ]),
  );
  const directions = new Map(
    snapshot.directions.map((located) => [
      directionIdentity(located.data),
      located,
    ]),
  );

  for (const located of snapshot.approvals) {
    const approval = located.data;
    const subjectKey = approvalSubjectIdentity(approval);
    let subjectDigest: string | undefined;
    let subjectSourcePath: string | undefined;
    if (approval.subject.type === "direction") {
      const asset = directions.get(subjectKey);
      if (asset === undefined) {
        addMissingApprovalReference(
          issues,
          located.sourcePath,
          "/subject",
          subjectKey,
        );
      } else {
        subjectDigest = calculateDigest(
          toDirectionReviewDigestSubject(asset.data),
        );
        subjectSourcePath = asset.sourcePath;
        if (
          wasApproved(approval.status) &&
          asset.data.selection.status !== "selected"
        ) {
          issues.push({
            code: "approval_subject_not_selected",
            message:
              "A Direction Approval cannot be approved until both required human roles select the same candidate.",
            path: "/subject",
            relatedSourcePath: asset.sourcePath,
            sourcePath: located.sourcePath,
          });
        }
      }
    } else if (approval.subject.type === "token-set") {
      const asset = tokenSets.get(subjectKey);
      if (asset === undefined) {
        addMissingApprovalReference(
          issues,
          located.sourcePath,
          "/subject",
          subjectKey,
        );
      } else {
        subjectDigest = calculateDigest(toTokenSetDigestSubject(asset.data));
        subjectSourcePath = asset.sourcePath;
      }
    } else if (approval.subject.type === "component") {
      const asset = components.get(subjectKey);
      if (asset === undefined) {
        addMissingApprovalReference(
          issues,
          located.sourcePath,
          "/subject",
          subjectKey,
        );
      } else {
        subjectDigest = calculateDigest(
          toButtonComponentContractDigestSubject(asset.data),
        );
        subjectSourcePath = asset.sourcePath;
      }
    }
    if (
      subjectDigest !== undefined &&
      subjectDigest !== approval.subject.contentDigest
    ) {
      issues.push({
        code: "content_digest_mismatch",
        message:
          "Approval subject contentDigest does not match the canonical source asset.",
        path: "/subject/contentDigest",
        ...(subjectSourcePath === undefined
          ? {}
          : { relatedSourcePath: subjectSourcePath }),
        sourcePath: located.sourcePath,
      });
    }

    approval.dependencies.forEach((dependency, dependencyIndex) => {
      const dependencyPath = `/dependencies/${String(dependencyIndex)}`;
      if (dependency.type === "brief") {
        const key = `${dependency.projectId}/brief/${dependency.assetId}@${dependency.assetVersion}`;
        const brief = briefs.get(key);
        if (brief === undefined) {
          addMissingApprovalReference(
            issues,
            located.sourcePath,
            dependencyPath,
            key,
          );
          return;
        }
        if (
          calculateDigest(toDesignBriefDigestSubject(brief.data)) !==
          dependency.contentDigest
        ) {
          issues.push({
            code: "content_digest_mismatch",
            message:
              "Approval dependency contentDigest does not match the canonical Design Brief.",
            path: `${dependencyPath}/contentDigest`,
            relatedSourcePath: brief.sourcePath,
            sourcePath: located.sourcePath,
          });
        }
        return;
      }

      const dependencyApproval =
        dependency.approvalId === null
          ? undefined
          : approvals.get(dependency.approvalId);
      if (dependencyApproval === undefined) {
        addMissingApprovalReference(
          issues,
          located.sourcePath,
          `${dependencyPath}/approvalId`,
          dependency.approvalId ?? "missing-approval-id",
        );
        return;
      }
      const dependencySubject = dependencyApproval.data.subject;
      if (
        dependencySubject.projectId !== dependency.projectId ||
        dependencySubject.type !== dependency.type ||
        dependencySubject.assetId !== dependency.assetId ||
        dependencySubject.assetVersion !== dependency.assetVersion ||
        dependencySubject.contentDigest !== dependency.contentDigest
      ) {
        issues.push({
          code: "approval_dependency_mismatch",
          message:
            "Approval dependency fields do not match the referenced Approval Record subject.",
          path: dependencyPath,
          relatedSourcePath: dependencyApproval.sourcePath,
          sourcePath: located.sourcePath,
        });
      }
    });

    if (approval.supersedes !== null) {
      const predecessor = approvals.get(approval.supersedes);
      if (predecessor === undefined) {
        addMissingApprovalReference(
          issues,
          located.sourcePath,
          "/supersedes",
          approval.supersedes,
        );
      } else if (
        predecessor.data.subject.projectId !== approval.subject.projectId ||
        predecessor.data.subject.type !== approval.subject.type ||
        predecessor.data.subject.assetId !== approval.subject.assetId ||
        compareSemanticVersions(
          predecessor.data.subject.assetVersion,
          approval.subject.assetVersion,
        ) >= 0 ||
        (wasApproved(approval.status) &&
          (predecessor.data.status !== "superseded" ||
            predecessor.data.termination?.type !== "superseded" ||
            predecessor.data.termination.replacementApprovalId !==
              approval.approvalId))
      ) {
        issues.push({
          code: "approval_lineage_mismatch",
          message:
            "The predecessor must be an earlier version of the same logical asset and, after replacement approval, point back to this Approval.",
          path: "/supersedes",
          relatedSourcePath: predecessor.sourcePath,
          sourcePath: located.sourcePath,
        });
      }
    }

    if (approval.termination?.type === "superseded") {
      const replacement = approvals.get(
        approval.termination.replacementApprovalId,
      );
      if (replacement === undefined) {
        addMissingApprovalReference(
          issues,
          located.sourcePath,
          "/termination/replacementApprovalId",
          approval.termination.replacementApprovalId,
        );
      } else if (
        replacement.data.subject.projectId !== approval.subject.projectId ||
        replacement.data.subject.type !== approval.subject.type ||
        replacement.data.subject.assetId !== approval.subject.assetId ||
        compareSemanticVersions(
          replacement.data.subject.assetVersion,
          approval.subject.assetVersion,
        ) <= 0 ||
        !wasApproved(replacement.data.status) ||
        replacement.data.supersedes !== approval.approvalId
      ) {
        issues.push({
          code: "approval_lineage_mismatch",
          message:
            "The replacement Approval must be a later version of the same logical asset and point back to the superseded Approval.",
          path: "/termination/replacementApprovalId",
          relatedSourcePath: replacement.sourcePath,
          sourcePath: located.sourcePath,
        });
      }
    }
  }
}

export function createDesignSystemIntegrityFailure(
  issues: readonly DesignSystemIntegrityIssue[],
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The design system contains ${String(issues.length)} integrity issue(s).`,
      recoveryInstruction:
        "Correct the source files and references listed in context.details.issues, then reload the design system.",
      target: { logicalId: "design-system", type: "registry" },
    }),
  );
}

export function validateDesignSystemSnapshot(
  expectedProjectId: string,
  documents: readonly DesignSystemSourceDocument[],
): ToolkitResult<DesignSystemSnapshot> {
  const issues: DesignSystemIntegrityIssue[] = [];
  const projectResult = stableIdSegmentSchema.safeParse(expectedProjectId);
  if (!projectResult.success) {
    addZodIssues(issues, ".", projectResult.error);
    return createDesignSystemIntegrityFailure(issues);
  }
  if (documents.length === 0) {
    issues.push({
      code: "missing_documents",
      message: "No design-system JSON documents were loaded.",
      path: "/documents",
      sourcePath: ".",
    });
  }

  const seenSourcePaths = new Set<string>();
  const snapshot: MutableSnapshot = {
    approvals: [],
    briefs: [],
    components: [],
    directions: [],
    registries: [],
    tokenSets: [],
  };

  for (const document of documents) {
    if (!isSafeRelativeSourcePath(document.sourcePath)) {
      issues.push({
        code: "unsafe_source_path",
        message: "Source path must be a normalized relative POSIX path.",
        path: "/sourcePath",
        sourcePath: ".",
      });
      continue;
    }
    if (seenSourcePaths.has(document.sourcePath)) {
      issues.push({
        code: "duplicate_source_path",
        message: `Source path '${document.sourcePath}' was loaded more than once.`,
        path: "/sourcePath",
        sourcePath: document.sourcePath,
      });
      continue;
    }
    seenSourcePaths.add(document.sourcePath);

    if (document.kind === "approval") {
      const result = approvalRecordSchema.safeParse(document.value);
      if (!result.success) {
        addZodIssues(issues, document.sourcePath, result.error);
      } else {
        addProjectMismatch(
          issues,
          expectedProjectId,
          document.sourcePath,
          result.data.subject.projectId,
        );
        snapshot.approvals.push({
          data: result.data,
          sourcePath: document.sourcePath,
        });
      }
      continue;
    }
    if (document.kind === "brief") {
      const result = designBriefSchema.safeParse(document.value);
      if (!result.success) {
        addZodIssues(issues, document.sourcePath, result.error);
      } else {
        addProjectMismatch(
          issues,
          expectedProjectId,
          document.sourcePath,
          result.data.projectId,
        );
        snapshot.briefs.push({
          data: result.data,
          sourcePath: document.sourcePath,
        });
      }
      continue;
    }
    if (document.kind === "token-set") {
      const result = tokenSetSchema.safeParse(document.value);
      if (!result.success) {
        addZodIssues(issues, document.sourcePath, result.error);
      } else {
        addProjectMismatch(
          issues,
          expectedProjectId,
          document.sourcePath,
          result.data.projectId,
        );
        snapshot.tokenSets.push({
          data: result.data,
          sourcePath: document.sourcePath,
        });
      }
      continue;
    }
    if (document.kind === "direction") {
      const result = directionReviewSchema.safeParse(document.value);
      if (!result.success) {
        addZodIssues(issues, document.sourcePath, result.error);
      } else {
        addProjectMismatch(
          issues,
          expectedProjectId,
          document.sourcePath,
          result.data.projectId,
        );
        snapshot.directions.push({
          data: result.data,
          sourcePath: document.sourcePath,
        });
      }
      continue;
    }
    if (document.kind === "component") {
      const result = buttonComponentContractSchema.safeParse(document.value);
      if (!result.success) {
        addZodIssues(issues, document.sourcePath, result.error);
      } else {
        addProjectMismatch(
          issues,
          expectedProjectId,
          document.sourcePath,
          result.data.projectId,
        );
        snapshot.components.push({
          data: result.data,
          sourcePath: document.sourcePath,
        });
      }
      continue;
    }

    const result = componentRegistrySchema.safeParse(document.value);
    if (!result.success) {
      addZodIssues(issues, document.sourcePath, result.error);
    } else {
      addProjectMismatch(
        issues,
        expectedProjectId,
        document.sourcePath,
        result.data.projectId,
      );
      snapshot.registries.push({
        data: result.data,
        sourcePath: document.sourcePath,
      });
    }
  }

  addDuplicateAssetIssues(
    snapshot.approvals,
    ({ data }) => approvalIdentity(data),
    issues,
  );
  addDuplicateAssetIssues(
    snapshot.briefs,
    ({ data }) => briefIdentity(data),
    issues,
  );
  addDuplicateAssetIssues(
    snapshot.tokenSets,
    ({ data }) => tokenIdentity(data),
    issues,
  );
  addDuplicateAssetIssues(
    snapshot.components,
    ({ data }) => componentIdentity(data),
    issues,
  );
  addDuplicateAssetIssues(
    snapshot.directions,
    ({ data }) => directionIdentity(data),
    issues,
  );

  if (issues.length > 0) {
    return createDesignSystemIntegrityFailure(issues);
  }

  validateComponentTokenReferences(snapshot, issues);
  validateDirectionBriefReferences(snapshot, issues);
  validateMergedRegistries(expectedProjectId, snapshot, issues);
  validateRegistryComponentReferences(snapshot, issues);
  if (issues.length > 0) {
    return createDesignSystemIntegrityFailure(issues);
  }

  return createSuccessResult({
    approvals: snapshot.approvals,
    briefs: snapshot.briefs,
    components: snapshot.components,
    directions: snapshot.directions,
    projectId: expectedProjectId,
    registries: snapshot.registries,
    tokenSets: snapshot.tokenSets,
  });
}

function digestComputationFailure(): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "INTERNAL_ERROR",
      message: "The design-system content digest could not be computed.",
      recoveryInstruction:
        "Check the configured SHA-256 adapter and retry without changing the source files.",
      target: { logicalId: "design-system-digest", type: "registry" },
    }),
  );
}

export function verifyDesignSystemContentDigests(
  snapshot: DesignSystemSnapshot,
  calculateDigest: JsonContentDigestCalculator,
): ToolkitResult<DesignSystemSnapshot> {
  const issues: DesignSystemIntegrityIssue[] = [];
  try {
    for (const brief of snapshot.briefs) {
      if (
        brief.data.contentDigest !== undefined &&
        calculateDigest(toDesignBriefDigestSubject(brief.data)) !==
          brief.data.contentDigest
      ) {
        issues.push({
          code: "content_digest_mismatch",
          message:
            "Stored Design Brief contentDigest does not match its canonical content.",
          path: "/contentDigest",
          sourcePath: brief.sourcePath,
        });
      }
    }
    for (const tokenSet of snapshot.tokenSets) {
      if (
        tokenSet.data.contentDigest !== undefined &&
        calculateDigest(toTokenSetDigestSubject(tokenSet.data)) !==
          tokenSet.data.contentDigest
      ) {
        issues.push({
          code: "content_digest_mismatch",
          message:
            "Stored Token Set contentDigest does not match its canonical content.",
          path: "/contentDigest",
          sourcePath: tokenSet.sourcePath,
        });
      }
    }
    for (const direction of snapshot.directions) {
      if (
        direction.data.contentDigest !== undefined &&
        calculateDigest(toDirectionReviewDigestSubject(direction.data)) !==
          direction.data.contentDigest
      ) {
        issues.push({
          code: "content_digest_mismatch",
          message:
            "Stored Direction Review contentDigest does not match its canonical content.",
          path: "/contentDigest",
          sourcePath: direction.sourcePath,
        });
      }
    }
    for (const component of snapshot.components) {
      if (
        component.data.contentDigest !== undefined &&
        calculateDigest(
          toButtonComponentContractDigestSubject(component.data),
        ) !== component.data.contentDigest
      ) {
        issues.push({
          code: "content_digest_mismatch",
          message:
            "Stored Component Contract contentDigest does not match its canonical content.",
          path: "/contentDigest",
          sourcePath: component.sourcePath,
        });
      }
    }
    validateDirectionBriefReferences(snapshot, issues, calculateDigest);
    validateApprovalReferences(snapshot, issues, calculateDigest);
  } catch {
    return digestComputationFailure();
  }
  return issues.length === 0
    ? createSuccessResult(snapshot)
    : createDesignSystemIntegrityFailure(issues);
}

export function validateDesignSystemIntegrity(
  expectedProjectId: string,
  documents: readonly DesignSystemSourceDocument[],
  calculateDigest: JsonContentDigestCalculator,
): ToolkitResult<DesignSystemSnapshot> {
  const snapshotResult = validateDesignSystemSnapshot(
    expectedProjectId,
    documents,
  );
  return snapshotResult.ok
    ? verifyDesignSystemContentDigests(snapshotResult.data, calculateDigest)
    : snapshotResult;
}
