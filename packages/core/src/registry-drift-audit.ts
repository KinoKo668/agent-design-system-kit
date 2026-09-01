import * as z from "zod";

import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import type { JsonObject, JsonValue } from "./json.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { semanticVersionMajor } from "./semantic-version.js";

export const REGISTRY_DRIFT_AUDIT_SCHEMA_VERSION = "1.0.0" as const;
export const REGISTRY_DRIFT_FINDING_CODES = [
  "REGISTRY_ASSET_MISSING_IN_FIGMA",
  "FIGMA_ASSET_MISSING_IN_REGISTRY",
  "FIGMA_ASSET_DUPLICATE",
  "FIGMA_MARKER_INVALID",
  "FIGMA_ASSET_VERSION_MISMATCH",
  "FIGMA_ASSET_DIGEST_MISMATCH",
  "FIGMA_LOCATOR_MISMATCH",
  "FIGMA_CHILD_SET_MISMATCH",
] as const;

const nodeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^\d+:\d+$/u);
const physicalIdSchema = z.string().min(1).max(256);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const expectedTokenCollectionSchema = z
  .object({
    assetId: stableAssetIdSchema,
    assetVersion: strictSemverSchema,
    contentDigest: contentDigestSchema.nullable(),
    stableId: stableAssetIdSchema,
    variableStableIds: z.array(stableAssetIdSchema).min(1).max(2_000),
  })
  .strict();

const expectedComponentSetSchema = z
  .object({
    assetId: stableAssetIdSchema,
    assetVersion: strictSemverSchema,
    componentSetKey: z.string().min(1).max(256).nullable(),
    contentDigest: contentDigestSchema,
    nodeId: nodeIdSchema,
    stableId: stableAssetIdSchema,
    variantStableIds: z.array(stableAssetIdSchema).min(1).max(200),
  })
  .strict();

export const registryDriftAuditPlanSchema = z
  .object({
    componentSets: z.array(expectedComponentSetSchema).min(1).max(500),
    fileBindingId: z.uuid(),
    projectId: stableIdSegmentSchema,
    schemaVersion: z.literal(REGISTRY_DRIFT_AUDIT_SCHEMA_VERSION),
    scope: z.literal("entire-file"),
    tokenCollections: z.array(expectedTokenCollectionSchema).min(1).max(500),
  })
  .strict()
  .superRefine((plan, context) => {
    const identities = new Set<string>();
    for (const [kind, assets] of [
      ["tokenCollections", plan.tokenCollections],
      ["componentSets", plan.componentSets],
    ] as const) {
      assets.forEach((asset, index) => {
        if (
          !asset.stableId.startsWith(`${plan.projectId}/`) ||
          identities.has(asset.stableId)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Registry drift identities must belong to the project and be unique.",
            path: [kind, index, "stableId"],
          });
        }
        identities.add(asset.stableId);
      });
    }
  });

export type RegistryDriftAuditPlan = z.infer<
  typeof registryDriftAuditPlanSchema
>;

const observedManagedAssetSchema = z
  .object({
    assetVersion: strictSemverSchema.nullable(),
    childStableIds: z.array(stableAssetIdSchema).max(2_000),
    contentDigest: contentDigestSchema.nullable(),
    kind: z.enum(["component-set", "token-collection"]),
    locatorKey: z.string().min(1).max(256).nullable(),
    markerStatus: z.enum(["applied", "creating", "invalid"]),
    physicalId: physicalIdSchema,
    stableId: stableAssetIdSchema.nullable(),
  })
  .strict();

export const registryDriftObservationSchema = z
  .object({
    assets: z.array(observedManagedAssetSchema).max(5_000),
    fileBindingId: z.uuid(),
    projectId: stableIdSegmentSchema,
  })
  .strict();

export type RegistryDriftObservation = z.infer<
  typeof registryDriftObservationSchema
>;

export const registryDriftFindingSchema = z
  .object({
    actual: z.record(z.string(), jsonValueSchema),
    code: z.enum(REGISTRY_DRIFT_FINDING_CODES),
    expected: z.record(z.string(), jsonValueSchema),
    kind: z.enum(["component-set", "token-collection"]),
    physicalId: physicalIdSchema.nullable(),
    recoveryInstruction: z.string().min(1).max(500),
    severity: z.literal("error"),
    stableId: stableAssetIdSchema.nullable(),
  })
  .strict();

export type RegistryDriftFinding = z.infer<typeof registryDriftFindingSchema>;

export const registryDriftAuditResultSchema = z
  .object({
    findings: z.array(registryDriftFindingSchema).max(10_000),
    passed: z.boolean(),
    schemaVersion: z.literal(REGISTRY_DRIFT_AUDIT_SCHEMA_VERSION),
    scope: z.literal("entire-file"),
    summary: z
      .object({
        auditedFigmaAssets: z.number().int().nonnegative(),
        duplicateAssets: z.number().int().nonnegative(),
        invalidMarkers: z.number().int().nonnegative(),
        locatorMismatches: z.number().int().nonnegative(),
        mismatchedChildren: z.number().int().nonnegative(),
        mismatchedDigests: z.number().int().nonnegative(),
        mismatchedVersions: z.number().int().nonnegative(),
        missingInFigma: z.number().int().nonnegative(),
        missingInRegistry: z.number().int().nonnegative(),
      })
      .strict(),
    type: z.literal("audit.registry-drift.scan"),
  })
  .strict()
  .superRefine((result, context) => {
    const count = (code: RegistryDriftFinding["code"]) =>
      result.findings.filter((finding) => finding.code === code).length;
    if (
      result.passed !== (result.findings.length === 0) ||
      result.summary.duplicateAssets !== count("FIGMA_ASSET_DUPLICATE") ||
      result.summary.invalidMarkers !== count("FIGMA_MARKER_INVALID") ||
      result.summary.locatorMismatches !== count("FIGMA_LOCATOR_MISMATCH") ||
      result.summary.mismatchedChildren !== count("FIGMA_CHILD_SET_MISMATCH") ||
      result.summary.mismatchedDigests !==
        count("FIGMA_ASSET_DIGEST_MISMATCH") ||
      result.summary.mismatchedVersions !==
        count("FIGMA_ASSET_VERSION_MISMATCH") ||
      result.summary.missingInFigma !==
        count("REGISTRY_ASSET_MISSING_IN_FIGMA") ||
      result.summary.missingInRegistry !==
        count("FIGMA_ASSET_MISSING_IN_REGISTRY")
    ) {
      context.addIssue({
        code: "custom",
        message: "Registry drift summary must exactly match its findings.",
        path: ["summary"],
      });
    }
  });

export type RegistryDriftAuditResult = z.infer<
  typeof registryDriftAuditResultSchema
>;

function failure(
  code:
    | "FILE_BINDING_MISMATCH"
    | "IDENTITY_CONFLICT"
    | "IDENTITY_NOT_FOUND"
    | "VALIDATION_FAILED",
  message: string,
  recoveryInstruction: string,
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code,
      message,
      recoveryInstruction,
      target: { logicalId: "registry-drift-audit", type: "operation" },
    }),
  );
}

export function createRegistryDriftAuditPlan(
  snapshot: DesignSystemSnapshot,
): ToolkitResult<RegistryDriftAuditPlan> {
  const entries = snapshot.registries.flatMap(({ data }) =>
    data.entries.filter(
      (entry) => entry.lifecycle === "active" && entry.figma.status === "ready",
    ),
  );
  const bindings = new Set(entries.map((entry) => entry.figma.fileBindingId));
  if (bindings.size === 0) {
    return failure(
      "IDENTITY_NOT_FOUND",
      "No Active Ready Registry assets are available for drift audit.",
      "Ensure and register an approved component library before auditing drift.",
    );
  }
  if (bindings.size > 1) {
    return failure(
      "IDENTITY_CONFLICT",
      "The Registry drift scope spans more than one Figma file.",
      "Select one registered library file before retrying.",
    );
  }
  const components = entries.flatMap((entry) => {
    if (entry.figma.status !== "ready") return [];
    const contract = snapshot.components.find(
      ({ data }) =>
        data.assetId === entry.asset.id &&
        data.assetVersion === entry.asset.version,
    )?.data;
    if (contract === undefined) return [];
    const root = `${snapshot.projectId}/component/${contract.assetId}/component-set/major-${semanticVersionMajor(contract.assetVersion)}`;
    return [
      {
        assetId: contract.assetId,
        assetVersion: contract.assetVersion,
        componentSetKey: entry.figma.locator.componentSetKey ?? null,
        contentDigest: entry.asset.contentDigest,
        nodeId: entry.figma.locator.nodeId,
        stableId: root,
        variantStableIds: contract.variants
          .map(({ slotId }) => `${root}/${slotId}`)
          .sort(),
      },
    ];
  });
  const tokenRefs = new Map<string, { assetId: string; assetVersion: string }>(
    components.flatMap((component) =>
      snapshot.components
        .filter(
          ({ data }) =>
            data.assetId === component.assetId &&
            data.assetVersion === component.assetVersion,
        )
        .map(
          ({ data }) =>
            [
              `${data.tokenSource.assetId}@${data.tokenSource.assetVersion}`,
              data.tokenSource,
            ] as const,
        ),
    ),
  );
  const tokenCollections = snapshot.tokenSets.flatMap(({ data }) => {
    const identity = `${data.assetId}@${data.assetVersion}`;
    if (!tokenRefs.has(identity)) return [];
    const root = `${snapshot.projectId}/token-set/${data.assetId}/variables/major-${semanticVersionMajor(data.assetVersion)}`;
    const mode = data.modes.find(({ id }) => id === data.defaultMode);
    if (mode === undefined) return [];
    return [
      {
        assetId: data.assetId,
        assetVersion: data.assetVersion,
        contentDigest: data.contentDigest ?? null,
        stableId: root,
        variableStableIds: mode.tokens
          .filter(({ $type }) => $type !== "typography")
          .map(({ path }) => `${root}/variable/${path.join("/")}`)
          .sort(),
      },
    ];
  });
  const parsed = registryDriftAuditPlanSchema.safeParse({
    componentSets: components,
    fileBindingId: [...bindings][0],
    projectId: snapshot.projectId,
    schemaVersion: REGISTRY_DRIFT_AUDIT_SCHEMA_VERSION,
    scope: "entire-file",
    tokenCollections,
  });
  return parsed.success
    ? createSuccessResult(parsed.data)
    : failure(
        "VALIDATION_FAILED",
        "The validated design system could not produce a Registry drift plan.",
        "Repair the Registry, Component Contracts, and referenced Token Sets.",
      );
}

function finding(
  code: RegistryDriftFinding["code"],
  kind: RegistryDriftFinding["kind"],
  stableId: string | null,
  physicalId: string | null,
  actual: JsonObject,
  expected: JsonObject,
  recoveryInstruction: string,
): RegistryDriftFinding {
  return {
    actual,
    code,
    expected,
    kind,
    physicalId,
    recoveryInstruction,
    severity: "error",
    stableId,
  };
}

export function auditRegistryDrift(
  planInput: unknown,
  observationInput: unknown,
): ToolkitResult<RegistryDriftAuditResult> {
  const plan = registryDriftAuditPlanSchema.safeParse(planInput);
  const observation =
    registryDriftObservationSchema.safeParse(observationInput);
  if (!plan.success || !observation.success) {
    return failure(
      "VALIDATION_FAILED",
      "Registry drift observations are invalid.",
      "Reload the Figma file with a compatible Hatchkit Plugin and retry.",
    );
  }
  if (
    observation.data.projectId !== plan.data.projectId ||
    observation.data.fileBindingId !== plan.data.fileBindingId
  ) {
    return failure(
      "FILE_BINDING_MISMATCH",
      "The observed Figma file does not match the Registry drift plan.",
      "Open the exact Registry-bound Figma library and retry.",
    );
  }
  const expected = new Map(
    [...plan.data.tokenCollections, ...plan.data.componentSets].map((asset) => [
      asset.stableId,
      asset,
    ]),
  );
  const actual = new Map<string, RegistryDriftObservation["assets"]>();
  const findings: RegistryDriftFinding[] = [];
  for (const asset of observation.data.assets) {
    if (asset.markerStatus === "invalid" || asset.stableId === null) {
      findings.push(
        finding(
          "FIGMA_MARKER_INVALID",
          asset.kind,
          asset.stableId,
          asset.physicalId,
          { markerStatus: asset.markerStatus },
          { markerStatus: "applied" },
          "Repair the managed marker through the approved ensure workflow.",
        ),
      );
      continue;
    }
    const existing = actual.get(asset.stableId) ?? [];
    actual.set(asset.stableId, [...existing, asset]);
  }
  for (const [stableId, expectedAsset] of expected) {
    const matches = actual.get(stableId) ?? [];
    const kind =
      "variantStableIds" in expectedAsset
        ? "component-set"
        : "token-collection";
    if (matches.length === 0) {
      findings.push(
        finding(
          "REGISTRY_ASSET_MISSING_IN_FIGMA",
          kind,
          stableId,
          null,
          { present: false },
          { present: true },
          "Run the approved ensure workflow before using this Registry asset.",
        ),
      );
      continue;
    }
    if (matches.length > 1) {
      findings.push(
        finding(
          "FIGMA_ASSET_DUPLICATE",
          kind,
          stableId,
          matches[0]?.physicalId ?? null,
          { physicalIds: matches.map(({ physicalId }) => physicalId) },
          { count: 1 },
          "Resolve duplicate managed identities through an approved migration.",
        ),
      );
    }
    const asset = matches[0];
    if (asset === undefined) continue;
    if (
      asset.markerStatus !== "applied" ||
      asset.assetVersion !== expectedAsset.assetVersion
    ) {
      findings.push(
        finding(
          "FIGMA_ASSET_VERSION_MISMATCH",
          kind,
          stableId,
          asset.physicalId,
          { markerStatus: asset.markerStatus, version: asset.assetVersion },
          { markerStatus: "applied", version: expectedAsset.assetVersion },
          "Apply the exact Registry version through the approved ensure workflow.",
        ),
      );
    }
    if (
      expectedAsset.contentDigest !== null &&
      asset.contentDigest !== expectedAsset.contentDigest
    ) {
      findings.push(
        finding(
          "FIGMA_ASSET_DIGEST_MISMATCH",
          kind,
          stableId,
          asset.physicalId,
          { contentDigest: asset.contentDigest },
          { contentDigest: expectedAsset.contentDigest },
          "Reconcile the Figma asset with the exact approved Git content.",
        ),
      );
    }
    const expectedChildren =
      "variantStableIds" in expectedAsset
        ? expectedAsset.variantStableIds
        : expectedAsset.variableStableIds;
    if (
      JSON.stringify([...asset.childStableIds].sort()) !==
      JSON.stringify([...expectedChildren].sort())
    ) {
      findings.push(
        finding(
          "FIGMA_CHILD_SET_MISMATCH",
          kind,
          stableId,
          asset.physicalId,
          { childStableIds: [...asset.childStableIds].sort() },
          { childStableIds: [...expectedChildren].sort() },
          "Restore the exact managed Variable or Variant child set.",
        ),
      );
    }
    if (
      "nodeId" in expectedAsset &&
      (asset.physicalId !== expectedAsset.nodeId ||
        (expectedAsset.componentSetKey !== null &&
          asset.locatorKey !== expectedAsset.componentSetKey))
    ) {
      findings.push(
        finding(
          "FIGMA_LOCATOR_MISMATCH",
          kind,
          stableId,
          asset.physicalId,
          { locatorKey: asset.locatorKey, physicalId: asset.physicalId },
          {
            locatorKey: expectedAsset.componentSetKey,
            physicalId: expectedAsset.nodeId,
          },
          "Repair the Registry Locator only after verifying the unique managed asset.",
        ),
      );
    }
  }
  for (const [stableId, assets] of actual) {
    if (expected.has(stableId)) continue;
    const asset = assets[0];
    if (asset === undefined) continue;
    findings.push(
      finding(
        "FIGMA_ASSET_MISSING_IN_REGISTRY",
        asset.kind,
        stableId,
        asset.physicalId,
        { present: true },
        { present: false },
        "Register the approved asset or migrate the unmanaged Figma identity.",
      ),
    );
  }
  findings.sort((left, right) =>
    `${left.stableId ?? ""}/${left.physicalId ?? ""}/${left.code}`.localeCompare(
      `${right.stableId ?? ""}/${right.physicalId ?? ""}/${right.code}`,
    ),
  );
  const count = (code: RegistryDriftFinding["code"]) =>
    findings.filter((findingItem) => findingItem.code === code).length;
  const parsed = registryDriftAuditResultSchema.safeParse({
    findings,
    passed: findings.length === 0,
    schemaVersion: REGISTRY_DRIFT_AUDIT_SCHEMA_VERSION,
    scope: "entire-file",
    summary: {
      auditedFigmaAssets: observation.data.assets.length,
      duplicateAssets: count("FIGMA_ASSET_DUPLICATE"),
      invalidMarkers: count("FIGMA_MARKER_INVALID"),
      locatorMismatches: count("FIGMA_LOCATOR_MISMATCH"),
      mismatchedChildren: count("FIGMA_CHILD_SET_MISMATCH"),
      mismatchedDigests: count("FIGMA_ASSET_DIGEST_MISMATCH"),
      mismatchedVersions: count("FIGMA_ASSET_VERSION_MISMATCH"),
      missingInFigma: count("REGISTRY_ASSET_MISSING_IN_FIGMA"),
      missingInRegistry: count("FIGMA_ASSET_MISSING_IN_REGISTRY"),
    },
    type: "audit.registry-drift.scan",
  });
  return parsed.success
    ? createSuccessResult(parsed.data)
    : failure(
        "VALIDATION_FAILED",
        "The Registry drift report exceeded its contract.",
        "Reduce the file scope or repair incompatible observations.",
      );
}
