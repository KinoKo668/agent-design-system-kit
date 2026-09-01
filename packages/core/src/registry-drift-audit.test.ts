import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  auditRegistryDrift,
  createRegistryDriftAuditPlan,
  type RegistryDriftAuditPlan,
  type RegistryDriftObservation,
} from "./registry-drift-audit.js";
import {
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";

function snapshot(registry: unknown = validRegistry) {
  const documents: DesignSystemSourceDocument[] = [
    {
      kind: "token-set",
      sourcePath: "tokens/button-foundation.tokens.json",
      value: validTokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: registry,
    },
  ];
  const result = validateDesignSystemSnapshot("hatch-demo", documents);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function plan(): RegistryDriftAuditPlan {
  const result = createRegistryDriftAuditPlan(snapshot());
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function cleanObservation(
  auditPlan: RegistryDriftAuditPlan,
): RegistryDriftObservation {
  return {
    assets: [
      ...auditPlan.tokenCollections.map((collection, index) => ({
        assetVersion: collection.assetVersion,
        childStableIds: collection.variableStableIds,
        contentDigest: collection.contentDigest,
        kind: "token-collection" as const,
        locatorKey: null,
        markerStatus: "applied" as const,
        physicalId: `VariableCollectionId:${index + 1}`,
        stableId: collection.stableId,
      })),
      ...auditPlan.componentSets.map((componentSet) => ({
        assetVersion: componentSet.assetVersion,
        childStableIds: componentSet.variantStableIds,
        contentDigest: componentSet.contentDigest,
        kind: "component-set" as const,
        locatorKey: componentSet.componentSetKey,
        markerStatus: "applied" as const,
        physicalId: componentSet.nodeId,
        stableId: componentSet.stableId,
      })),
    ],
    fileBindingId: auditPlan.fileBindingId,
    projectId: auditPlan.projectId,
  };
}

describe("Registry to Figma drift audit", () => {
  it("builds an exact entire-file plan from Active Ready Registry assets", () => {
    const result = createRegistryDriftAuditPlan(snapshot());
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data).toMatchObject({
      componentSets: [
        {
          assetId: "button",
          assetVersion: "1.0.0",
          componentSetKey: "fixture_button_component_set_key_0001",
          nodeId: "100:200",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
      ],
      fileBindingId: "00000000-0000-4000-8000-000000000001",
      projectId: "hatch-demo",
      scope: "entire-file",
      tokenCollections: [
        {
          assetId: "button-foundation",
          assetVersion: "1.0.0",
          stableId: "hatch-demo/token-set/button-foundation/variables/major-1",
        },
      ],
    });
    expect(result.data.componentSets[0]?.variantStableIds).toHaveLength(4);
    expect(result.data.tokenCollections[0]?.variableStableIds).toHaveLength(30);
  });

  it("passes only when the complete Figma inventory matches Git", () => {
    const auditPlan = plan();
    expect(
      auditRegistryDrift(auditPlan, cleanObservation(auditPlan)),
    ).toMatchObject({
      data: {
        findings: [],
        passed: true,
        summary: { auditedFigmaAssets: 2 },
      },
      ok: true,
    });
  });

  it("reports missing, extra, duplicate, invalid, version, digest, locator, and child drift", () => {
    const auditPlan = plan();
    const observation = cleanObservation(auditPlan);
    const collection = observation.assets[0];
    const componentSet = observation.assets[1];
    if (collection === undefined || componentSet === undefined) {
      throw new Error("Expected demo audit inventory.");
    }
    const result = auditRegistryDrift(auditPlan, {
      ...observation,
      assets: [
        {
          ...componentSet,
          assetVersion: "2.0.0",
          childStableIds: componentSet.childStableIds.slice(1),
          contentDigest:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          locatorKey: "wrong-component-key",
          physicalId: "999:999",
        },
        { ...componentSet, physicalId: "999:998" },
        {
          assetVersion: null,
          childStableIds: [],
          contentDigest: null,
          kind: "token-collection",
          locatorKey: null,
          markerStatus: "invalid",
          physicalId: "VariableCollectionId:invalid",
          stableId: null,
        },
        {
          ...collection,
          physicalId: "VariableCollectionId:extra",
          stableId: "hatch-demo/token-set/extra/variables/major-1",
        },
      ],
    });
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data.summary).toEqual({
      auditedFigmaAssets: 4,
      duplicateAssets: 1,
      invalidMarkers: 1,
      locatorMismatches: 1,
      mismatchedChildren: 1,
      mismatchedDigests: 1,
      mismatchedVersions: 1,
      missingInFigma: 1,
      missingInRegistry: 1,
    });
    expect(new Set(result.data.findings.map(({ code }) => code))).toEqual(
      new Set([
        "FIGMA_ASSET_DIGEST_MISMATCH",
        "FIGMA_ASSET_DUPLICATE",
        "FIGMA_ASSET_MISSING_IN_REGISTRY",
        "FIGMA_ASSET_VERSION_MISMATCH",
        "FIGMA_CHILD_SET_MISMATCH",
        "FIGMA_LOCATOR_MISMATCH",
        "FIGMA_MARKER_INVALID",
        "REGISTRY_ASSET_MISSING_IN_FIGMA",
      ]),
    );
  });

  it("rejects observations from another Figma file", () => {
    const auditPlan = plan();
    expect(
      auditRegistryDrift(auditPlan, {
        ...cleanObservation(auditPlan),
        fileBindingId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toMatchObject({ error: { code: "FILE_BINDING_MISMATCH" }, ok: false });
  });

  it("fails closed when no Active Ready component exists", () => {
    const entry = validRegistry.entries[0];
    if (entry === undefined) throw new Error("Expected Registry entry.");
    const registry = {
      ...validRegistry,
      entries: [
        {
          ...entry,
          figma: {
            channel: entry.figma.channel,
            fileBindingId: entry.figma.fileBindingId,
            majorVersion: entry.figma.majorVersion,
            role: entry.figma.role,
            slotId: entry.figma.slotId,
            status: "unbuilt",
          },
        },
      ],
    };
    expect(createRegistryDriftAuditPlan(snapshot(registry))).toMatchObject({
      error: { code: "IDENTITY_NOT_FOUND" },
      ok: false,
    });
  });
});
