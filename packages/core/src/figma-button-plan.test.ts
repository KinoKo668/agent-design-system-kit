import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  createFigmaButtonPlan,
  figmaButtonPlanSchema,
} from "./figma-button-plan.js";

const COMPONENT_DIGEST =
  "sha256:7e6003e59916e0fc445e7ef6d37feb148a3d77908bb7834b3bdb4185530d0e78";
const TOKEN_DIGEST = `sha256:${"a".repeat(64)}`;

describe("Figma Button plan", () => {
  it("creates a deterministic Component Set and four Variant plan", () => {
    const result = createFigmaButtonPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(figmaButtonPlanSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.componentSet).toMatchObject({
      majorVersion: 1,
      name: "Button",
      stableId: "hatch-demo/component/button/component-set/major-1",
    });
    expect(result.data.variants.map(({ figmaName }) => figmaName)).toEqual([
      "Appearance=Primary, State=Default",
      "Appearance=Primary, State=Disabled",
      "Appearance=Secondary, State=Default",
      "Appearance=Secondary, State=Disabled",
    ]);
    expect(result.data.variants[3]).toMatchObject({
      stableId:
        "hatch-demo/component/button/component-set/major-1/variant/appearance-secondary/state-disabled",
    });
  });

  it("maps typography Variables but resolves unitless line-height as percent", () => {
    const result = createFigmaButtonPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.typography).toMatchObject({
      fontFamily: { fallback: "Inter" },
      fontSize: { fallback: 14 },
      fontStyleFallback: "Medium",
      fontWeight: { fallback: 500 },
      letterSpacing: { fallback: 0 },
      lineHeight: { fallback: 143, unit: "PERCENT" },
      tokenPath: "semantic/typography/action-label",
    });
    expect(result.data.typography.lineHeight).not.toHaveProperty(
      "variableStableId",
    );
  });

  it("keeps raw node opacity while referencing the Figma percentage Variable", () => {
    const result = createFigmaButtonPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const disabled = result.data.variants[1];
    expect(
      disabled?.bindings.find(({ target }) => target === "container.opacity"),
    ).toMatchObject({
      fallback: 0.48,
      kind: "float",
      variableStableId:
        "hatch-demo/token-set/button-foundation/variables/major-1/variable/semantic/number/action-disabled-opacity",
    });
  });

  it("rejects stale source digests", () => {
    expect(
      createFigmaButtonPlan(
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

  it("rejects externally supplied identities and Variable ownership drift", () => {
    const result = createFigmaButtonPlan(
      validContract,
      validTokenSet,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changedRoot = structuredClone(result.data);
    changedRoot.componentSet.stableId =
      "hatch-demo/component/button/component-set/major-2";
    expect(figmaButtonPlanSchema.safeParse(changedRoot).success).toBe(false);

    const changedVariable = structuredClone(result.data);
    changedVariable.typography.fontSize.variableStableId =
      "other/token-set/button/variables/major-1/variable/primitive/dimension/font-size";
    expect(figmaButtonPlanSchema.safeParse(changedVariable).success).toBe(
      false,
    );
  });
});
