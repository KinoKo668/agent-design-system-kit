import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  auditFigmaComponentObservations,
  createFigmaComponentAuditPlan,
} from "./component-audit.js";
import {
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";

function snapshot(registry: unknown = validRegistry) {
  const documents: DesignSystemSourceDocument[] = [
    {
      kind: "token-set",
      sourcePath: "tokens/foundation.tokens.json",
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

describe("Figma component provenance audit", () => {
  it("builds exact registered Component Set and Variant sources from Git", () => {
    const result = createFigmaComponentAuditPlan(snapshot());
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data).toMatchObject({
      fileBindingId: "00000000-0000-4000-8000-000000000001",
      projectId: "hatch-demo",
      scope: "current-page",
      sources: [
        {
          assetId: "button",
          assetVersion: "1.0.0",
          componentSetNodeId: "100:200",
          componentSetStableId:
            "hatch-demo/component/button/component-set/major-1",
        },
      ],
    });
    expect(result.data.sources[0]?.variants).toHaveLength(4);
    expect(result.data.sources[0]?.variants).toContainEqual(
      expect.objectContaining({
        figmaName: "Appearance=Primary, State=Default",
        properties: { Appearance: "Primary", State: "Default" },
        stableId:
          "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
      }),
    );
  });

  it("locates detached nodes, foreign sources, wrong Variants, drift, and marker mismatch", () => {
    const planned = createFigmaComponentAuditPlan(snapshot());
    if (!planned.ok) throw new Error(planned.error.message);
    const source = planned.data.sources[0];
    const variant = source?.variants.find(({ slotId }) =>
      slotId.endsWith("appearance-primary/state-default"),
    );
    if (source === undefined || variant === undefined) {
      throw new Error("Expected Button audit source.");
    }
    const node = (id: string, name: string, type = "INSTANCE") => ({
      id,
      name,
      type,
    });
    const registeredSource = {
      componentNodeId: "100:201",
      componentSetNodeId: source.componentSetNodeId,
      componentSetStableId: source.componentSetStableId,
      componentStableId: variant.stableId,
      variantProperties: variant.properties,
    };
    const result = auditFigmaComponentObservations(
      planned.data,
      { id: "1:2", name: "Checkout" },
      [
        {
          managedInstance: null,
          node: node("2:1", "Approved Button"),
          source: registeredSource,
        },
        {
          managedInstance: {
            componentSetStableId: source.componentSetStableId,
            instanceStableId: "hatch-demo/instance/checkout/detached",
            phase: "applied",
            variantStableId: variant.stableId,
          },
          node: node("2:2", "Detached Button", "FRAME"),
          source: null,
        },
        {
          managedInstance: null,
          node: node("2:3", "Foreign Instance"),
          source: {
            ...registeredSource,
            componentSetStableId: null,
            componentStableId: null,
          },
        },
        {
          managedInstance: null,
          node: node("2:4", "Unknown Variant"),
          source: {
            ...registeredSource,
            componentStableId: `${source.componentSetStableId}/variant/appearance-tertiary/state-default`,
          },
        },
        {
          managedInstance: null,
          node: node("2:5", "Drifted Variant"),
          source: {
            ...registeredSource,
            variantProperties: { Appearance: "Secondary", State: "Default" },
          },
        },
        {
          managedInstance: {
            componentSetStableId: source.componentSetStableId,
            instanceStableId: "hatch-demo/instance/checkout/stale-marker",
            phase: "applied",
            variantStableId:
              source.variants.find(
                ({ stableId }) => stableId !== variant.stableId,
              )?.stableId ?? variant.stableId,
          },
          node: node("2:6", "Stale Marker"),
          source: registeredSource,
        },
      ],
    );

    expect(result).toMatchObject({
      data: {
        passed: false,
        summary: {
          auditedNodes: 6,
          compliantInstances: 1,
          detachedOrApproximate: 1,
          provenanceMismatches: 2,
          unregisteredSources: 1,
          unregisteredVariants: 1,
          variantPropertyMismatches: 1,
        },
      },
      ok: true,
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(
      result.data.findings.map(({ code, node: findingNode }) => [
        findingNode.id,
        code,
      ]),
    ).toEqual([
      ["2:2", "DETACHED_OR_APPROXIMATE_COMPONENT"],
      ["2:2", "INSTANCE_PROVENANCE_MISMATCH"],
      ["2:3", "UNREGISTERED_COMPONENT_SOURCE"],
      ["2:4", "UNREGISTERED_VARIANT"],
      ["2:5", "VARIANT_PROPERTY_MISMATCH"],
      ["2:6", "INSTANCE_PROVENANCE_MISMATCH"],
    ]);
  });

  it("fails closed when no active Ready component source exists", () => {
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
    expect(createFigmaComponentAuditPlan(snapshot(registry))).toMatchObject({
      error: { code: "IDENTITY_NOT_FOUND" },
      ok: false,
    });
  });
});
