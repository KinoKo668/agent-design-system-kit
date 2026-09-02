import { describe, expect, it } from "vitest";

import iconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconRegistry from "../../../design-system/hatch-demo/registry/icons.registry.json" with { type: "json" };
import iconTokens from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import { validateDesignSystemSnapshot } from "./design-system-snapshot.js";
import { createFigmaIconInstancePlan } from "./figma-icon-instance-plan.js";

function snapshot(status: "ready" | "unbuilt" = "ready") {
  const entry = iconRegistry.entries[0];
  if (entry === undefined) throw new Error("Icon Registry fixture missing.");
  const registry =
    status === "unbuilt"
      ? iconRegistry
      : {
          ...iconRegistry,
          entries: [
            {
              ...entry,
              figma: {
                ...entry.figma,
                appliedDigest: entry.asset.contentDigest,
                appliedVersion: entry.asset.version,
                locator: {
                  componentSetKey: "icon-check-component-set-key",
                  nodeId: "500:600",
                },
                status: "ready",
              },
            },
          ],
        };
  const result = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/icon-foundation.tokens.json",
      value: iconTokens,
    },
    {
      kind: "component",
      sourcePath: "components/icon-check.component.json",
      value: iconContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/icons.registry.json",
      value: registry,
    },
  ]);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

const REQUEST = {
  assetId: "icon/check",
  instanceId: "screen-checkout/success-check",
  projectId: "hatch-demo",
  variantSelections: { size: "large" },
  x: 180,
  y: 260,
} as const;

describe("createFigmaIconInstancePlan", () => {
  it("converts one exact Ready Icon into a deterministic Instance plan", () => {
    const first = createFigmaIconInstancePlan(snapshot(), REQUEST);
    const second = createFigmaIconInstancePlan(snapshot(), REQUEST);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      data: {
        componentSet: {
          nodeId: "500:600",
          stableId: "hatch-demo/component/icon/check/component-set/major-1",
        },
        instance: {
          stableId: "hatch-demo/instance/screen-checkout/success-check",
          x: 180,
          y: 260,
        },
        properties: { size: { name: "Size", value: "Large" } },
        selectedVariant: {
          figmaName: "Size=Large",
          selections: { size: "large" },
        },
      },
      ok: true,
    });
    expect(
      first.ok &&
        first.data.componentSet.expectedVariantStableIds.includes(
          "hatch-demo/component/icon/check/component-set/major-1/variant/size-large",
        ),
    ).toBe(true);
  });

  it("rejects Unbuilt Icons, unknown sizes and non-Icon assets", () => {
    expect(
      createFigmaIconInstancePlan(snapshot("unbuilt"), REQUEST),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      createFigmaIconInstancePlan(snapshot(), {
        ...REQUEST,
        variantSelections: { size: "huge" },
      }),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
  });
});
