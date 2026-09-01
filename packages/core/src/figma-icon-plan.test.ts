import { describe, expect, it } from "vitest";

import iconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import iconTokens from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import { createFigmaIconPlan, figmaIconPlanSchema } from "./figma-icon-plan.js";

const COMPONENT_DIGEST =
  "sha256:1b1231911fc691152b6d5e0f95d9681f02995033c97457d3aafccbda592fa260";
const TOKEN_DIGEST =
  "sha256:3e6525097fe95c63b373adf9b7a6797e3153a4670665c0da9563fc971f62315e";

describe("Figma Icon plan", () => {
  it("creates one deterministic three-size Component Set", () => {
    const result = createFigmaIconPlan(
      iconContract,
      iconTokens,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(figmaIconPlanSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.componentSet).toMatchObject({
      defaultSize: "Medium",
      name: "Icon / Check",
      stableId: "hatch-demo/component/icon/check/component-set/major-1",
    });
    expect(
      result.data.variants.map(({ figmaName, frame }) => [
        figmaName,
        frame.size,
      ]),
    ).toEqual([
      ["Size=Small", 16],
      ["Size=Medium", 24],
      ["Size=Large", 32],
    ]);
    const smallGlyph = result.data.variants[0]?.glyph;
    expect(smallGlyph?.scale).toBeCloseTo(2 / 3);
    expect(smallGlyph?.width).toBeCloseTo(28 / 3);
    expect(smallGlyph?.height).toBeCloseTo(20 / 3);
    expect(smallGlyph?.x).toBeCloseTo(10 / 3);
    expect(smallGlyph?.y).toBe(5);
    expect(smallGlyph?.strokeWidth).toBeCloseTo(4 / 3);
  });

  it("binds size and stroke color to the exact Token Collection", () => {
    const result = createFigmaIconPlan(
      iconContract,
      iconTokens,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.glyph.color).toMatchObject({
      fallback: { a: 1, b: 0.1, g: 0.1, r: 0.1 },
      variableStableId:
        "hatch-demo/token-set/icon-foundation/variables/major-1/variable/semantic/color/icon-default",
    });
    expect(result.data.variants[2]?.frame.variableStableId).toBe(
      "hatch-demo/token-set/icon-foundation/variables/major-1/variable/semantic/dimension/icon-size-large",
    );
  });

  it("rejects stale source digests", () => {
    expect(
      createFigmaIconPlan(
        iconContract,
        iconTokens,
        `sha256:${"a".repeat(64)}`,
        TOKEN_DIGEST,
      ),
    ).toMatchObject({
      error: { context: { details: { issue: "component_digest_mismatch" } } },
      ok: false,
    });
  });

  it("rejects externally supplied stable identities", () => {
    const result = createFigmaIconPlan(
      iconContract,
      iconTokens,
      COMPONENT_DIGEST,
      TOKEN_DIGEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = structuredClone(result.data);
    changed.variants[0]!.stableId =
      "hatch-demo/component/icon/check/component-set/major-2/variant/size-small";
    expect(figmaIconPlanSchema.safeParse(changed).success).toBe(false);
  });
});
