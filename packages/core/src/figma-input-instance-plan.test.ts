import { describe, expect, it } from "vitest";

import inputContract from "../../../design-system/hatch-demo/components/input-text.component.json" with { type: "json" };
import inputRegistry from "../../../design-system/hatch-demo/registry/inputs.registry.json" with { type: "json" };
import inputTokens from "../../../design-system/hatch-demo/tokens/input-foundation.tokens.json" with { type: "json" };

import { validateDesignSystemSnapshot } from "./design-system-snapshot.js";
import { createFigmaInputInstancePlan } from "./figma-input-instance-plan.js";

function snapshot(status: "ready" | "unbuilt" = "ready") {
  const entry = inputRegistry.entries[0];
  if (entry === undefined) throw new Error("Input Registry fixture missing.");
  const registry =
    status === "unbuilt"
      ? inputRegistry
      : {
          ...inputRegistry,
          entries: [
            {
              ...entry,
              figma: {
                ...entry.figma,
                appliedDigest: entry.asset.contentDigest,
                appliedVersion: entry.asset.version,
                locator: {
                  componentSetKey: "input-text-component-set-key",
                  nodeId: "700:800",
                },
                status: "ready",
              },
            },
          ],
        };
  const result = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/input-foundation.tokens.json",
      value: inputTokens,
    },
    {
      kind: "component",
      sourcePath: "components/input-text.component.json",
      value: inputContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/inputs.registry.json",
      value: registry,
    },
  ]);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

const REQUEST = {
  assetId: "input/text",
  instanceId: "screen-sign-up/email",
  label: "Email address",
  projectId: "hatch-demo",
  supportingText: "Enter a valid work email address.",
  text: "alex@example.com",
  variantSelections: { content: "filled", state: "error" },
  x: 120,
  y: 240,
} as const;

describe("createFigmaInputInstancePlan", () => {
  it("creates one deterministic Ready Input Instance plan", () => {
    const first = createFigmaInputInstancePlan(snapshot(), REQUEST);
    const second = createFigmaInputInstancePlan(snapshot(), REQUEST);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      data: {
        componentSet: {
          nodeId: "700:800",
          stableId: "hatch-demo/component/input/text/component-set/major-1",
        },
        instance: {
          stableId: "hatch-demo/instance/screen-sign-up/email",
          x: 120,
          y: 240,
        },
        properties: {
          content: { name: "Content", value: "Filled" },
          label: { name: "Label", value: "Email address" },
          state: { name: "State", value: "Error" },
          supportingText: {
            name: "Supporting text",
            value: "Enter a valid work email address.",
          },
          text: { name: "Text", value: "alex@example.com" },
        },
        selectedVariant: {
          figmaName: "State=Error, Content=Filled",
          selections: { content: "filled", state: "error" },
        },
      },
      ok: true,
    });
    expect(
      first.ok &&
        first.data.componentSet.expectedVariantStableIds.includes(
          "hatch-demo/component/input/text/component-set/major-1/variant/state-error/content-filled",
        ),
    ).toBe(true);
  });

  it("rejects Unbuilt Inputs, invalid variants and unsafe text", () => {
    expect(
      createFigmaInputInstancePlan(snapshot("unbuilt"), REQUEST),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      createFigmaInputInstancePlan(snapshot(), {
        ...REQUEST,
        variantSelections: { content: "filled", state: "hovered" },
      }),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(
      createFigmaInputInstancePlan(snapshot(), {
        ...REQUEST,
        supportingText: " Invalid email ",
      }),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
  });
});
