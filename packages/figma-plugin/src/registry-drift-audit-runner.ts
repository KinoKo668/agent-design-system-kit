import type {
  ErrorCode,
  JsonObject,
  RegistryDriftAuditPlan,
  RegistryDriftAuditResult,
  RegistryDriftFinding,
  RegistryDriftObservation,
} from "@agent-design-system-kit/core";

import {
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export interface FigmaRegistryDriftAuditPort {
  readonly document: SharedPluginDataPort;
  getObservation(): Promise<RegistryDriftObservation>;
}

export class RegistryDriftAuditError extends Error {
  readonly code: ErrorCode;
  readonly recoveryInstruction: string;

  constructor(input: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly recoveryInstruction: string;
  }) {
    super(input.message);
    this.name = "RegistryDriftAuditError";
    this.code = input.code;
    this.recoveryInstruction = input.recoveryInstruction;
  }
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

export async function runFigmaRegistryDriftAudit(
  port: FigmaRegistryDriftAuditPort,
  plan: RegistryDriftAuditPlan,
): Promise<RegistryDriftAuditResult> {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== plan.projectId ||
    binding.fileBindingId !== plan.fileBindingId
  ) {
    throw new RegistryDriftAuditError({
      code: "FILE_BINDING_MISMATCH",
      message: "The open Figma file does not match the Registry drift plan.",
      recoveryInstruction:
        "Open the exact Registry-bound Figma library and retry.",
    });
  }
  const observation = await port.getObservation();
  if (
    observation.projectId !== plan.projectId ||
    observation.fileBindingId !== plan.fileBindingId ||
    observation.assets.length > 5_000
  ) {
    throw new RegistryDriftAuditError({
      code: "VALIDATION_FAILED",
      message: "The full-file Figma inventory is invalid or too large.",
      recoveryInstruction:
        "Repair the file binding or reduce the library below 5,000 managed assets.",
    });
  }
  const expected = new Map(
    [...plan.tokenCollections, ...plan.componentSets].map((asset) => [
      asset.stableId,
      asset,
    ]),
  );
  const actual = new Map<string, RegistryDriftObservation["assets"]>();
  const findings: RegistryDriftFinding[] = [];
  for (const asset of observation.assets) {
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
    actual.set(asset.stableId, [...(actual.get(asset.stableId) ?? []), asset]);
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
    const asset = matches[0];
    if (asset === undefined) continue;
    if (matches.length > 1) {
      findings.push(
        finding(
          "FIGMA_ASSET_DUPLICATE",
          kind,
          stableId,
          asset.physicalId,
          { physicalIds: matches.map(({ physicalId }) => physicalId) },
          { count: 1 },
          "Resolve duplicate managed identities through an approved migration.",
        ),
      );
    }
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
    findings.filter((candidate) => candidate.code === code).length;
  return {
    findings,
    passed: findings.length === 0,
    schemaVersion: "1.0.0",
    scope: "entire-file",
    summary: {
      auditedFigmaAssets: observation.assets.length,
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
  };
}
