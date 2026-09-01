import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokens from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import { validateDesignSystemSnapshot } from "./design-system-snapshot.js";
import { createFigmaButtonInstancePlan } from "./figma-button-instance-plan.js";

function snapshot(status: "ready" | "unbuilt" = "ready") {
  const entry = validRegistry.entries[0];
  if (entry === undefined) throw new Error("Registry fixture missing.");
  const result = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/button-foundation.tokens.json",
      value: validTokens,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value:
        status === "ready"
          ? validRegistry
          : {
              ...validRegistry,
              entries: [
                {
                  ...entry,
                  figma: {
                    channel: "library",
                    fileBindingId: entry.figma.fileBindingId,
                    majorVersion: entry.figma.majorVersion,
                    role: "component-set",
                    slotId: "root",
                    status: "unbuilt",
                  },
                },
              ],
            },
    },
  ]);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

const REQUEST = {
  assetId: "button",
  instanceId: "screen-checkout/submit",
  label: "Place order",
  projectId: "hatch-demo",
  variantSelections: { appearance: "secondary", state: "disabled" },
  x: 120,
  y: 240,
};

describe("createFigmaButtonInstancePlan", () => {
  it("converts one exact Ready Registry resolution into a deterministic plan", () => {
    const first = createFigmaButtonInstancePlan(snapshot(), REQUEST);
    const second = createFigmaButtonInstancePlan(snapshot(), REQUEST);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      data: {
        componentSet: {
          nodeId: "100:200",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        instance: {
          stableId: "hatch-demo/instance/screen-checkout/submit",
          x: 120,
          y: 240,
        },
        properties: {
          appearance: { name: "Appearance", value: "Secondary" },
          label: { name: "Label", value: "Place order" },
          state: { name: "State", value: "Disabled" },
        },
        selectedVariant: {
          figmaName: "Appearance=Secondary, State=Disabled",
        },
      },
      ok: true,
    });
    expect(
      first.ok &&
        first.data.componentSet.expectedVariantStableIds.includes(
          "hatch-demo/component/button/component-set/major-1/variant/appearance-secondary/state-disabled",
        ),
    ).toBe(true);
  });

  it("rejects Unbuilt, unknown Variants and unsafe request values", () => {
    expect(
      createFigmaButtonInstancePlan(snapshot("unbuilt"), REQUEST),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      createFigmaButtonInstancePlan(snapshot(), {
        ...REQUEST,
        variantSelections: { appearance: "tertiary", state: "default" },
      }),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(
      createFigmaButtonInstancePlan(snapshot(), {
        ...REQUEST,
        label: " Place order ",
      }),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
  });
});
