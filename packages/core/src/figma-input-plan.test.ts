import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/input-text.component.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/input-foundation.tokens.json" with { type: "json" };

import {
  createFigmaInputPlan,
  figmaInputPlanSchema,
} from "./figma-input-plan.js";

const COMPONENT_DIGEST =
  "sha256:cdcc977da4014343e91edef042a55335821d8eaffc8d8098dc865f798321cfc5";
const TOKEN_DIGEST =
  "sha256:84eff4f8b036b88b861f494251eb9c59b4066774531bd147389af611ff520e6d";

describe("Figma Input plan", () => {
  it("creates the exact deterministic eight-Variant Component Set", () => {
    const result = createFigmaInputPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(figmaInputPlanSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.componentSet).toMatchObject({
      majorVersion: 1,
      name: "Input / Text",
      stableId: "hatch-demo/component/input/text/component-set/major-1",
    });
    expect(result.data.layout).toEqual({
      fieldHeight: 48,
      gap: 6,
      paddingInline: 12,
      width: 320,
    });
    expect(result.data.variants.map(({ figmaName }) => figmaName)).toEqual([
      "State=Default, Content=Empty",
      "State=Default, Content=Filled",
      "State=Focused, Content=Empty",
      "State=Focused, Content=Filled",
      "State=Error, Content=Empty",
      "State=Error, Content=Filled",
      "State=Disabled, Content=Empty",
      "State=Disabled, Content=Filled",
    ]);
  });

  it("maps state feedback and all three typography roles", () => {
    const result = createFigmaInputPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const focused = result.data.variants[2];
    const error = result.data.variants[4];
    expect(
      focused?.bindings.find(({ target }) => target === "field.border-width"),
    ).toMatchObject({ fallback: 2, kind: "float" });
    expect(
      error?.bindings.find(({ target }) => target === "field.border"),
    ).toMatchObject({ kind: "color" });
    expect(
      error?.bindings.find(({ target }) => target === "support.fill"),
    ).toMatchObject({ kind: "color" });
    expect(result.data.typography).toMatchObject({
      label: { fontStyleFallback: "Medium" },
      support: { fontStyleFallback: "Regular" },
      value: { fontStyleFallback: "Regular" },
    });
  });

  it("keeps every Variable inside the Input Token Collection", () => {
    const result = createFigmaInputPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const prefix =
      "hatch-demo/token-set/input-foundation/variables/major-1/variable/";
    const ids = [
      ...result.data.sharedBindings,
      ...result.data.variants.flatMap(({ bindings }) => bindings),
      ...Object.values(result.data.typography).flatMap((typography) => [
        typography.fontFamily,
        typography.fontSize,
        typography.fontWeight,
        typography.letterSpacing,
      ]),
    ].map(({ variableStableId }) => variableStableId);
    expect(ids.every((stableId) => stableId.startsWith(prefix))).toBe(true);
  });

  it("rejects stale source digests", () => {
    expect(
      createFigmaInputPlan(
        validContract,
        validTokenSet,
        `sha256:${"b".repeat(64)}`,
        TOKEN_DIGEST,
      ),
    ).toMatchObject({
      error: {
        context: { details: { issue: "component_digest_mismatch" } },
      },
      ok: false,
    });
  });

  it("rejects identity and Variable ownership drift", () => {
    const result = createFigmaInputPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changedRoot = structuredClone(result.data);
    changedRoot.componentSet.stableId =
      "hatch-demo/component/input/text/component-set/major-2";
    expect(figmaInputPlanSchema.safeParse(changedRoot).success).toBe(false);

    const changedVariable = structuredClone(result.data);
    changedVariable.typography.value.fontSize.variableStableId =
      "other/token-set/input/variables/major-1/variable/primitive/dimension/font-size";
    expect(figmaInputPlanSchema.safeParse(changedVariable).success).toBe(false);
  });
});
