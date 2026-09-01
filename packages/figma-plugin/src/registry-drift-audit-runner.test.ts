import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import {
  auditRegistryDrift,
  createRegistryDriftAuditPlan,
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
  type RegistryDriftAuditPlan,
} from "@agent-design-system-kit/core";

import { createFigmaRegistryDriftAuditPort } from "./figma-registry-drift-audit-port.js";
import { runFigmaRegistryDriftAudit } from "./registry-drift-audit-runner.js";
import {
  FILE_BINDING_SHARED_KEY,
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";

function plan(): RegistryDriftAuditPlan {
  const documents: DesignSystemSourceDocument[] = [
    { kind: "token-set", sourcePath: "tokens/demo.json", value: validTokenSet },
    {
      kind: "component",
      sourcePath: "components/button.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.json",
      value: validRegistry,
    },
  ];
  const snapshot = validateDesignSystemSnapshot("hatch-demo", documents);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const result = createRegistryDriftAuditPlan(snapshot.data);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function shared(
  id: string,
  managedMarker = "",
  onWrite: () => void = () => undefined,
) {
  return {
    id,
    getSharedPluginData(namespace: string, key: string) {
      return namespace === HATCHKIT_SHARED_NAMESPACE &&
        key === MANAGED_ASSET_SHARED_KEY
        ? managedMarker
        : "";
    },
    setSharedPluginData() {
      onWrite();
    },
  };
}

function appliedMarker(input: {
  assetId: string;
  assetType: "component" | "token-set";
  assetVersion: string;
  digest: string;
  majorVersion: number;
  role:
    "component-set" | "component-variant" | "variable" | "variable-collection";
  slotId: string;
}) {
  return JSON.stringify({
    appliedDigest: input.digest,
    assetId: input.assetId,
    assetType: input.assetType,
    assetVersion: input.assetVersion,
    channel: "library",
    majorVersion: input.majorVersion,
    phase: "applied",
    projectId: "hatch-demo",
    role: input.role,
    schemaVersion: "1.0.0",
    slotId: input.slotId,
  });
}

describe("Figma Registry drift audit", () => {
  it("loads the entire file, inventories managed assets, and performs zero writes", async () => {
    const auditPlan = plan();
    const collection = auditPlan.tokenCollections[0];
    const componentSet = auditPlan.componentSets[0];
    if (collection === undefined || componentSet === undefined) {
      throw new Error("Expected demo audit plan.");
    }
    let loads = 0;
    let writes = 0;
    const digest = componentSet.contentDigest;
    const variables = collection.variableStableIds.map((stableId, index) => ({
      ...shared(
        `VariableID:${index}`,
        appliedMarker({
          assetId: collection.assetId,
          assetType: "token-set",
          assetVersion: collection.assetVersion,
          digest,
          majorVersion: 1,
          role: "variable",
          slotId: stableId.split("/variable/")[1] ?? "invalid",
        }),
        () => (writes += 1),
      ),
      variableCollectionId: "VariableCollectionId:1",
    }));
    const componentChildren = componentSet.variantStableIds.map(
      (stableId, index) => ({
        ...shared(
          `100:${201 + index}`,
          appliedMarker({
            assetId: componentSet.assetId,
            assetType: "component",
            assetVersion: componentSet.assetVersion,
            digest,
            majorVersion: 1,
            role: "component-variant",
            slotId: stableId.slice(componentSet.stableId.length + 1),
          }),
          () => (writes += 1),
        ),
        type: "COMPONENT",
      }),
    );
    const binding = JSON.stringify({
      fileBindingId: FILE_BINDING_ID,
      fileRole: "design-system-library",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    });
    const root = {
      ...shared("0:0", "", () => (writes += 1)),
      findAll: () => [
        {
          ...shared(
            componentSet.nodeId,
            appliedMarker({
              assetId: componentSet.assetId,
              assetType: "component",
              assetVersion: componentSet.assetVersion,
              digest,
              majorVersion: 1,
              role: "component-set",
              slotId: "root",
            }),
            () => (writes += 1),
          ),
          children: componentChildren,
          key: componentSet.componentSetKey ?? "",
          type: "COMPONENT_SET",
        },
      ],
      getSharedPluginData(namespace: string, key: string) {
        return namespace === HATCHKIT_SHARED_NAMESPACE &&
          key === FILE_BINDING_SHARED_KEY
          ? binding
          : "";
      },
    };
    const port = createFigmaRegistryDriftAuditPort({
      loadAllPagesAsync: () => {
        loads += 1;
        return Promise.resolve();
      },
      root,
      variables: {
        getLocalVariableCollectionsAsync: () =>
          Promise.resolve([
            {
              ...shared(
                "VariableCollectionId:1",
                appliedMarker({
                  assetId: collection.assetId,
                  assetType: "token-set",
                  assetVersion: collection.assetVersion,
                  digest,
                  majorVersion: 1,
                  role: "variable-collection",
                  slotId: "root",
                }),
                () => (writes += 1),
              ),
            },
          ]),
        getLocalVariablesAsync: () => Promise.resolve(variables),
      },
    });

    const observation = await port.getObservation();
    const coreResult = auditRegistryDrift(auditPlan, observation);
    if (!coreResult.ok) throw new Error(coreResult.error.message);
    await expect(runFigmaRegistryDriftAudit(port, auditPlan)).resolves.toEqual(
      coreResult.data,
    );
    expect(observation.assets).toHaveLength(2);
    expect(observation.assets[0]?.childStableIds).toHaveLength(30);
    expect(observation.assets[1]?.childStableIds).toHaveLength(4);
    expect(loads).toBe(2);
    expect(writes).toBe(0);
  });

  it("surfaces malformed root and child markers without mutating Figma", async () => {
    const binding = JSON.stringify({
      fileBindingId: FILE_BINDING_ID,
      fileRole: "design-system-library",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    });
    const port = createFigmaRegistryDriftAuditPort({
      loadAllPagesAsync: () => Promise.resolve(),
      root: {
        ...shared("0:0"),
        findAll: () => [
          {
            ...shared("100:200", "{broken"),
            children: [shared("100:201", "{}")],
            type: "COMPONENT_SET",
          },
        ],
        getSharedPluginData(namespace: string, key: string) {
          return namespace === HATCHKIT_SHARED_NAMESPACE &&
            key === FILE_BINDING_SHARED_KEY
            ? binding
            : "";
        },
      },
      variables: {
        getLocalVariableCollectionsAsync: () => Promise.resolve([]),
        getLocalVariablesAsync: () => Promise.resolve([]),
      },
    });

    const observation = await port.getObservation();
    expect(observation.assets).toEqual([
      expect.objectContaining({
        markerStatus: "invalid",
        physicalId: "100:200",
      }),
      expect.objectContaining({
        markerStatus: "invalid",
        physicalId: "100:201",
      }),
    ]);
  });
});
