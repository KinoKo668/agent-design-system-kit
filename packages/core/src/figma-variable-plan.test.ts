import { describe, expect, it } from "vitest";

import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  createFigmaVariablePlan,
  figmaVariablePlanSchema,
} from "./figma-variable-plan.js";

const TOKEN_FIXTURE: unknown = validTokenSet;
const DIGEST = `sha256:${"a".repeat(64)}`;

describe("Figma Variable plan", () => {
  it("maps the Button Token Set into one deterministic, strict collection", () => {
    const result = createFigmaVariablePlan(TOKEN_FIXTURE, DIGEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(figmaVariablePlanSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.collection).toMatchObject({
      defaultModeId:
        "hatch-demo/token-set/button-foundation/variables/major-1/mode/light",
      majorVersion: 1,
      name: "Button foundation / v1",
      stableId: "hatch-demo/token-set/button-foundation/variables/major-1",
    });
    expect(result.data.variables).toHaveLength(30);
    expect(result.data.deferredTypography).toHaveLength(1);
    expect(
      result.data.variables.find(
        (variable) =>
          variable.tokenPath === "semantic/color/action-primary-background",
      ),
    ).toMatchObject({
      codeSyntax: "var(--hatch-demo-semantic-color-action-primary-background)",
      resolvedType: "COLOR",
      scopes: ["FRAME_FILL", "SHAPE_FILL"],
      values: [
        {
          value: {
            kind: "alias",
            targetStableId:
              "hatch-demo/token-set/button-foundation/variables/major-1/variable/primitive/color/brand-600",
          },
        },
      ],
    });
    expect(result.warnings.map(({ code }) => code)).toEqual([
      "FIGMA_FONT_FALLBACKS_METADATA_ONLY",
      "FIGMA_TYPOGRAPHY_STYLE_DEFERRED",
    ]);
  });

  it("converts an opacity primitive to Figma percentage semantics", () => {
    const result = createFigmaVariablePlan(TOKEN_FIXTURE, DIGEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opacity = result.data.variables.find(
      (variable) => variable.tokenPath === "primitive/number/opacity-disabled",
    );
    expect(opacity?.values[0]?.value).toEqual({ kind: "float", value: 48 });
    expect(
      result.data.variables.find(
        (variable) =>
          variable.tokenPath === "semantic/number/action-disabled-opacity",
      )?.scopes,
    ).toEqual(["OPACITY"]);
  });

  it("rejects rem values until a project conversion is configured", () => {
    const changed = structuredClone(TOKEN_FIXTURE) as {
      modes: Array<{
        tokens: Array<{
          $type: string;
          $value: unknown;
        }>;
      }>;
    };
    const dimension = changed.modes[0]?.tokens.find(
      (token) =>
        token.$type === "dimension" && typeof token.$value === "object",
    );
    if (dimension === undefined) throw new Error("Fixture dimension missing.");
    dimension.$value = { unit: "rem", value: 2.5 };

    const result = createFigmaVariablePlan(changed, DIGEST);
    expect(result).toMatchObject({
      error: { context: { details: { issue: "rem_conversion_required" } } },
      ok: false,
    });
  });

  it("rejects a semantic token whose Figma scope cannot be inferred safely", () => {
    const changed = structuredClone(TOKEN_FIXTURE) as {
      modes: Array<{
        tokens: Array<{ $description: string; path: string[] }>;
      }>;
    };
    const semantic = changed.modes[0]?.tokens.find(
      (token) =>
        token.path.join("/") === "semantic/color/action-primary-background",
    );
    if (semantic === undefined) throw new Error("Fixture semantic missing.");
    semantic.path = ["semantic", "color", "action-primary-surface"];

    const result = createFigmaVariablePlan(changed, DIGEST);
    expect(result).toMatchObject({
      error: { context: { details: { issue: "scope_mapping_required" } } },
      ok: false,
    });
  });

  it("rejects a mismatched stored digest before planning", () => {
    const changed = {
      ...(TOKEN_FIXTURE as Record<string, unknown>),
      contentDigest: `sha256:${"b".repeat(64)}`,
    };
    const result = createFigmaVariablePlan(changed, DIGEST);
    expect(result).toMatchObject({
      error: { context: { details: { issue: "content_digest_mismatch" } } },
      ok: false,
    });
  });

  it("rejects duplicate identities and missing alias targets in an external plan", () => {
    const result = createFigmaVariablePlan(TOKEN_FIXTURE, DIGEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const duplicate = structuredClone(result.data);
    const first = duplicate.variables[0];
    const second = duplicate.variables[1];
    if (first === undefined || second === undefined) {
      throw new Error("Plan Variable fixtures missing.");
    }
    second.stableId = first.stableId;
    expect(figmaVariablePlanSchema.safeParse(duplicate).success).toBe(false);

    const missingAlias = structuredClone(result.data);
    const alias = missingAlias.variables.find(({ values }) =>
      values.some(({ value }) => value.kind === "alias"),
    );
    const aliasValue = alias?.values.find(
      ({ value }) => value.kind === "alias",
    )?.value;
    if (aliasValue?.kind !== "alias") {
      throw new Error("Plan alias fixture missing.");
    }
    aliasValue.targetStableId =
      "hatch-demo/token-set/button-foundation/variables/major-1/variable/primitive/color/missing";
    expect(figmaVariablePlanSchema.safeParse(missingAlias).success).toBe(false);
  });

  it("derives an aliased font-weight Variable type from its primitive", () => {
    const changed = structuredClone(TOKEN_FIXTURE) as {
      modes: Array<{ tokens: unknown[] }>;
    };
    changed.modes[0]?.tokens.push({
      $description: "Button label weight.",
      $type: "fontWeight",
      $value: "{primitive.font-weight.medium}",
      path: ["semantic", "font-weight", "action-label"],
    });

    const result = createFigmaVariablePlan(changed, DIGEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.data.variables.find(
        ({ tokenPath }) => tokenPath === "semantic/font-weight/action-label",
      ),
    ).toMatchObject({ resolvedType: "FLOAT", scopes: ["FONT_WEIGHT"] });
  });

  it("bounds Figma display names and fails cleanly on oversized identities", () => {
    const longName = {
      ...(TOKEN_FIXTURE as Record<string, unknown>),
      name: "A".repeat(120),
    };
    const named = createFigmaVariablePlan(longName, DIGEST);
    expect(named.ok).toBe(true);
    if (named.ok)
      expect(named.data.collection.name.length).toBeLessThanOrEqual(120);

    const longIdentity = {
      ...(TOKEN_FIXTURE as Record<string, unknown>),
      assetId: `a${"b".repeat(179)}`,
    };
    expect(createFigmaVariablePlan(longIdentity, DIGEST)).toMatchObject({
      error: { context: { details: { issue: "figma_identity_too_long" } } },
      ok: false,
    });
  });
});
