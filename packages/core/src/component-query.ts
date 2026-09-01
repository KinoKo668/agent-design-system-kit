import * as z from "zod";

import type { ButtonComponentContract } from "./button-contract.js";
import {
  FIGMA_BINDING_STATUSES,
  REGISTRY_LIFECYCLES,
  type ComponentRegistryEntry,
} from "./component-registry.js";
import { compareSemanticVersions } from "./semantic-version.js";
import type {
  DesignSystemSnapshot,
  LocatedDesignAsset,
} from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import type { JsonObject } from "./json.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import {
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { toValidationIssues } from "./schema-validation.js";

export const COMPONENT_AVAILABILITIES = [
  "ensure-required",
  "figma-ready",
  "unavailable",
] as const;

export type ComponentAvailability = (typeof COMPONENT_AVAILABILITIES)[number];

const exactSearchTermSchema = z
  .string()
  .min(1, "Must not be empty.")
  .max(192, "Must contain at most 192 characters.")
  .refine((value) => value.trim() === value, {
    message: "Must not start or end with whitespace.",
  });

export const componentSearchQuerySchema = z.strictObject({
  assetId: stableAssetIdSchema.optional(),
  assetVersion: strictSemverSchema.optional(),
  figmaStatus: z.enum([...FIGMA_BINDING_STATUSES, "any"]).default("any"),
  lifecycle: z.enum([...REGISTRY_LIFECYCLES, "any"]).default("active"),
  projectId: stableIdSegmentSchema,
  term: exactSearchTermSchema.optional(),
});

const variantSelectionsSchema = z
  .record(stableIdSegmentSchema, stableIdSegmentSchema)
  .refine((value) => Object.keys(value).length <= 32, {
    message: "Must contain at most 32 Variant selections.",
  });

export const componentResolveQuerySchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.optional(),
  projectId: stableIdSegmentSchema,
  variantSelections: variantSelectionsSchema.default({}),
});

export type ComponentSearchQuery = z.input<typeof componentSearchQuerySchema>;
export type NormalizedComponentSearchQuery = z.output<
  typeof componentSearchQuerySchema
>;
export type ComponentResolveQuery = z.input<typeof componentResolveQuerySchema>;
export type NormalizedComponentResolveQuery = z.output<
  typeof componentResolveQuerySchema
>;

export interface ComponentSourceReferences {
  readonly contractSourcePath: string;
  readonly registrySourcePath: string;
}

export interface ComponentSearchItem {
  readonly approvalId: string;
  readonly asset: ComponentRegistryEntry["asset"];
  readonly availability: ComponentAvailability;
  readonly componentKind: ButtonComponentContract["componentKind"];
  readonly figmaStatus: ComponentRegistryEntry["figma"]["status"];
  readonly lifecycle: ComponentRegistryEntry["lifecycle"];
  readonly lifecycleReason: string | null;
  readonly matchFields: readonly ("assetId" | "name" | "profile")[];
  readonly name: ButtonComponentContract["name"];
  readonly profile: ButtonComponentContract["profile"];
  readonly size: ButtonComponentContract["size"];
  readonly sources: ComponentSourceReferences;
}

export interface ComponentSearchResults {
  readonly items: readonly ComponentSearchItem[];
  readonly query: NormalizedComponentSearchQuery;
  readonly total: number;
}

type ButtonVariant = ButtonComponentContract["variants"][number];
type ReadyRegistryEntry = ComponentRegistryEntry & {
  readonly figma: Extract<
    ComponentRegistryEntry["figma"],
    { readonly status: "ready" }
  >;
  readonly lifecycle: "active";
};
type UnbuiltRegistryEntry = ComponentRegistryEntry & {
  readonly figma: Extract<
    ComponentRegistryEntry["figma"],
    { readonly status: "unbuilt" }
  >;
  readonly lifecycle: "active";
};

interface ComponentResolutionBase {
  readonly contract: ButtonComponentContract;
  readonly selectedVariant: ButtonVariant;
  readonly sources: ComponentSourceReferences;
  readonly variantSelections: Readonly<Record<string, string>>;
}

export interface FigmaReadyComponentResolution extends ComponentResolutionBase {
  readonly nextAction: "verify-approval-and-audit-then-insert-instance";
  readonly registryEntry: ReadyRegistryEntry;
  readonly status: "figma-ready";
}

export interface EnsureRequiredComponentResolution extends ComponentResolutionBase {
  readonly nextAction: "verify-approval-then-ensure-library-asset";
  readonly registryEntry: UnbuiltRegistryEntry;
  readonly status: "ensure-required";
}

export type ComponentResolution =
  EnsureRequiredComponentResolution | FigmaReadyComponentResolution;

interface ComponentCandidate {
  readonly contract: LocatedDesignAsset<ButtonComponentContract>;
  readonly entry: ComponentRegistryEntry;
  readonly registrySourcePath: string;
}

function componentIdentity(
  projectId: string,
  assetId: string,
  assetVersion: string,
): string {
  return `${projectId}/component/${assetId}@${assetVersion}`;
}

function catalogInvariantFailure(): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "INTERNAL_ERROR",
      message:
        "The verified design-system snapshot could not be converted into a component catalog.",
      recoveryInstruction:
        "Reload and validate the design-system files before repeating the query.",
      target: { logicalId: "component-catalog", type: "registry" },
    }),
  );
}

function collectCandidates(
  snapshot: DesignSystemSnapshot,
): ToolkitResult<readonly ComponentCandidate[]> {
  const contracts = new Map(
    snapshot.components.map((contract) => [
      componentIdentity(
        contract.data.projectId,
        contract.data.assetId,
        contract.data.assetVersion,
      ),
      contract,
    ]),
  );
  const candidates: ComponentCandidate[] = [];
  for (const registry of snapshot.registries) {
    for (const entry of registry.data.entries) {
      const contract = contracts.get(
        componentIdentity(
          registry.data.projectId,
          entry.asset.id,
          entry.asset.version,
        ),
      );
      if (contract === undefined) {
        return catalogInvariantFailure();
      }
      candidates.push({
        contract,
        entry,
        registrySourcePath: registry.sourcePath,
      });
    }
  }
  return createSuccessResult(candidates);
}

function queryValidationFailure(
  kind: "resolve" | "search",
  error: z.ZodError,
): FailureResult {
  const issues = toValidationIssues(error);
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The component ${kind} query contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and query again.",
      target: { logicalId: `component-${kind}-query`, type: "component" },
    }),
  );
}

function availabilityOf(entry: ComponentRegistryEntry): ComponentAvailability {
  if (entry.lifecycle !== "active") {
    return "unavailable";
  }
  return entry.figma.status === "ready" ? "figma-ready" : "ensure-required";
}

function exactTermMatches(
  candidate: ComponentCandidate,
  term: string | undefined,
): readonly ("assetId" | "name" | "profile")[] {
  if (term === undefined) {
    return [];
  }
  const normalized = term.toLowerCase();
  const fields: Array<"assetId" | "name" | "profile"> = [];
  if (candidate.entry.asset.id.toLowerCase() === normalized) {
    fields.push("assetId");
  }
  if (candidate.contract.data.name.toLowerCase() === normalized) {
    fields.push("name");
  }
  if (candidate.contract.data.profile.toLowerCase() === normalized) {
    fields.push("profile");
  }
  return fields;
}

function compareCandidates(
  left: ComponentCandidate,
  right: ComponentCandidate,
): number {
  if (left.entry.asset.id !== right.entry.asset.id) {
    return left.entry.asset.id < right.entry.asset.id ? -1 : 1;
  }
  const versionOrder = compareSemanticVersions(
    right.entry.asset.version,
    left.entry.asset.version,
  );
  if (versionOrder !== 0) {
    return versionOrder;
  }
  return left.registrySourcePath < right.registrySourcePath
    ? -1
    : left.registrySourcePath > right.registrySourcePath
      ? 1
      : 0;
}

function toSearchItem(
  candidate: ComponentCandidate,
  matchFields: readonly ("assetId" | "name" | "profile")[],
): ComponentSearchItem {
  return {
    approvalId: candidate.entry.approvalId,
    asset: candidate.entry.asset,
    availability: availabilityOf(candidate.entry),
    componentKind: candidate.contract.data.componentKind,
    figmaStatus: candidate.entry.figma.status,
    lifecycle: candidate.entry.lifecycle,
    lifecycleReason: candidate.entry.lifecycleReason,
    matchFields,
    name: candidate.contract.data.name,
    profile: candidate.contract.data.profile,
    size: candidate.contract.data.size,
    sources: {
      contractSourcePath: candidate.contract.sourcePath,
      registrySourcePath: candidate.registrySourcePath,
    },
  };
}

export function searchComponents(
  snapshot: DesignSystemSnapshot,
  input: unknown,
): ToolkitResult<ComponentSearchResults> {
  const queryResult = componentSearchQuerySchema.safeParse(input);
  if (!queryResult.success) {
    return queryValidationFailure("search", queryResult.error);
  }
  const catalogResult = collectCandidates(snapshot);
  if (!catalogResult.ok) {
    return catalogResult;
  }
  const query = queryResult.data;
  const items = [...catalogResult.data]
    .sort(compareCandidates)
    .flatMap((candidate) => {
      if (candidate.contract.data.projectId !== query.projectId) {
        return [];
      }
      if (
        query.assetId !== undefined &&
        candidate.entry.asset.id !== query.assetId
      ) {
        return [];
      }
      if (
        query.assetVersion !== undefined &&
        candidate.entry.asset.version !== query.assetVersion
      ) {
        return [];
      }
      if (
        query.lifecycle !== "any" &&
        candidate.entry.lifecycle !== query.lifecycle
      ) {
        return [];
      }
      if (
        query.figmaStatus !== "any" &&
        candidate.entry.figma.status !== query.figmaStatus
      ) {
        return [];
      }
      const matchFields = exactTermMatches(candidate, query.term);
      return query.term !== undefined && matchFields.length === 0
        ? []
        : [toSearchItem(candidate, matchFields)];
    });
  return createSuccessResult({ items, query, total: items.length });
}

function notFoundFailure(
  query: NormalizedComponentResolveQuery,
): FailureResult {
  const expected: JsonObject = {
    assetId: query.assetId,
    assetType: "component",
    lifecycle: "active",
    projectId: query.projectId,
    ...(query.assetVersion === undefined
      ? {}
      : { assetVersion: query.assetVersion }),
  };
  return createFailureResult(
    createToolkitError({
      code: "IDENTITY_NOT_FOUND",
      context: { expected },
      message: `No active Component '${query.assetId}' matched the exact resolve query.`,
      recoveryInstruction:
        "Search registered component identities or submit a Component Change Request; do not create a visual approximation.",
      target: {
        logicalId: query.assetId,
        type: "component",
        ...(query.assetVersion === undefined
          ? {}
          : { version: query.assetVersion }),
      },
    }),
  );
}

function conflictFailure(
  query: NormalizedComponentResolveQuery,
  candidates: readonly ComponentCandidate[],
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "IDENTITY_CONFLICT",
      context: {
        actual: { matchCount: candidates.length },
        details: {
          sourcePaths: candidates.map(
            (candidate) => candidate.registrySourcePath,
          ),
        },
      },
      message: `Component '${query.assetId}' resolved to more than one active Registry entry.`,
      recoveryInstruction:
        "Correct the Registry so the logical component has exactly one active entry, then reload it.",
      target: {
        logicalId: query.assetId,
        type: "component",
        ...(query.assetVersion === undefined
          ? {}
          : { version: query.assetVersion }),
      },
    }),
  );
}

interface VariantSelectionResult {
  readonly selections: Readonly<Record<string, string>>;
  readonly variant: ButtonVariant;
}

function resolveVariant(
  contract: ButtonComponentContract,
  requested: Readonly<Record<string, string>>,
): ToolkitResult<VariantSelectionResult> {
  const issues: Array<{ code: string; message: string; path: string }> = [];
  const variantProperties = contract.properties.filter(
    (property) => property.kind === "variant",
  );
  const properties = new Map(
    variantProperties.map((property) => [property.id, property]),
  );
  for (const propertyId of Object.keys(requested)) {
    if (!properties.has(propertyId)) {
      issues.push({
        code: "unknown_variant_property",
        message: `Component Contract does not define Variant property '${propertyId}'.`,
        path: `/variantSelections/${propertyId}`,
      });
    }
  }

  const selections: Record<string, string> = {};
  for (const property of variantProperties) {
    const value = requested[property.id] ?? property.defaultOptionId;
    if (!property.options.some((option) => option.id === value)) {
      issues.push({
        code: "unsupported_variant_option",
        message: `Variant property '${property.id}' does not define option '${value}'.`,
        path: `/variantSelections/${property.id}`,
      });
      continue;
    }
    selections[property.id] = value;
  }
  if (issues.length > 0) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        context: { details: { issues } },
        message: `The requested Variant contains ${String(issues.length)} validation issue(s).`,
        recoveryInstruction:
          "Use only Variant properties and options declared by the resolved Component Contract.",
        target: {
          logicalId: contract.assetId,
          type: "component",
          version: contract.assetVersion,
        },
      }),
    );
  }

  const variant = contract.variants.find((candidate) =>
    Object.entries(selections).every(
      ([propertyId, value]) => candidate.selections[propertyId] === value,
    ),
  );
  if (variant === undefined) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        context: {
          details: {
            issues: [
              {
                code: "variant_not_registered",
                message:
                  "The requested Variant combination is not registered by the Component Contract.",
                path: "/variantSelections",
              },
            ],
          },
        },
        message: "The requested Variant combination is not registered.",
        recoveryInstruction:
          "Choose a registered Variant or submit a Component Change Request.",
        target: {
          logicalId: contract.assetId,
          type: "component",
          version: contract.assetVersion,
        },
      }),
    );
  }
  return createSuccessResult({ selections, variant });
}

export function resolveComponent(
  snapshot: DesignSystemSnapshot,
  input: unknown,
): ToolkitResult<ComponentResolution> {
  const queryResult = componentResolveQuerySchema.safeParse(input);
  if (!queryResult.success) {
    return queryValidationFailure("resolve", queryResult.error);
  }
  const catalogResult = collectCandidates(snapshot);
  if (!catalogResult.ok) {
    return catalogResult;
  }
  const query = queryResult.data;
  const candidates = catalogResult.data.filter(
    (candidate) =>
      candidate.contract.data.projectId === query.projectId &&
      candidate.entry.asset.id === query.assetId &&
      candidate.entry.lifecycle === "active" &&
      (query.assetVersion === undefined ||
        candidate.entry.asset.version === query.assetVersion),
  );
  if (candidates.length === 0) {
    return notFoundFailure(query);
  }
  if (candidates.length > 1) {
    return conflictFailure(query, candidates);
  }

  const candidate = candidates[0];
  if (candidate === undefined) {
    return catalogInvariantFailure();
  }
  const variantResult = resolveVariant(
    candidate.contract.data,
    query.variantSelections,
  );
  if (!variantResult.ok) {
    return variantResult;
  }
  const base = {
    contract: candidate.contract.data,
    selectedVariant: variantResult.data.variant,
    sources: {
      contractSourcePath: candidate.contract.sourcePath,
      registrySourcePath: candidate.registrySourcePath,
    },
    variantSelections: variantResult.data.selections,
  };
  if (candidate.entry.figma.status === "unbuilt") {
    return createSuccessResult(
      {
        ...base,
        nextAction: "verify-approval-then-ensure-library-asset",
        registryEntry: candidate.entry as UnbuiltRegistryEntry,
        status: "ensure-required",
      },
      [
        {
          code: "APPROVAL_GUARD_REQUIRED",
          message:
            "The Registry stores an Approval reference, but the authoritative Approval Record must be verified before Figma work.",
          target: {
            logicalId: candidate.entry.approvalId,
            type: "approval",
            version: candidate.entry.asset.version,
          },
        },
        {
          code: "FIGMA_ENSURE_REQUIRED",
          message:
            "The active Component is registered but its Figma library asset has not been built.",
          target: {
            logicalId: candidate.entry.asset.id,
            type: "figma-asset",
            version: candidate.entry.asset.version,
          },
        },
      ],
    );
  }
  return createSuccessResult(
    {
      ...base,
      nextAction: "verify-approval-and-audit-then-insert-instance",
      registryEntry: candidate.entry as ReadyRegistryEntry,
      status: "figma-ready",
    },
    [
      {
        code: "APPROVAL_GUARD_REQUIRED",
        message:
          "The Registry stores an Approval reference, but the authoritative Approval Record must be verified before insertion.",
        target: {
          logicalId: candidate.entry.approvalId,
          type: "approval",
          version: candidate.entry.asset.version,
        },
      },
      {
        code: "FIGMA_AUDIT_REQUIRED",
        message:
          "The Registry binding is ready, but the real Figma asset must still pass a current audit before insertion.",
        target: {
          logicalId: candidate.entry.asset.id,
          type: "figma-asset",
          version: candidate.entry.asset.version,
        },
      },
    ],
  );
}
