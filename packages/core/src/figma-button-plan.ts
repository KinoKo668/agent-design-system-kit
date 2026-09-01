import * as z from "zod";

import {
  validateButtonComponentContractWithTokenSet,
  type ButtonBindingTarget,
  type ButtonComponentContract,
} from "./button-contract.js";
import { createToolkitError } from "./errors.js";
import { createFigmaVariablePlan } from "./figma-variable-plan.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import {
  parseTokenReference,
  validateTokenSet,
  type TokenSet,
} from "./token-set.js";

export const FIGMA_BUTTON_PLAN_SCHEMA_VERSION = "1.0.0" as const;

const boundedText = (maximum: number): z.ZodString =>
  z.string().min(1).max(maximum);

const plannedColorSchema = z
  .object({
    a: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    r: z.number().min(0).max(1),
  })
  .strict();

const plannedBindingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      fallback: plannedColorSchema,
      kind: z.literal("color"),
      target: z.enum([
        "container.border-color",
        "container.fill",
        "label.fill",
      ]),
      variableStableId: stableAssetIdSchema,
    })
    .strict(),
  z
    .object({
      fallback: z.number().finite(),
      kind: z.literal("float"),
      target: z.enum([
        "container.border-width",
        "container.height",
        "container.opacity",
        "container.padding-inline",
        "container.radius",
      ]),
      variableStableId: stableAssetIdSchema,
    })
    .strict(),
]);

const typographyVariableSchema = z
  .object({
    fallback: z.union([boundedText(120), z.number().finite()]),
    variableStableId: stableAssetIdSchema,
  })
  .strict();

export const figmaButtonPlanSchema = z
  .object({
    componentSet: z
      .object({
        description: boundedText(2_000),
        majorVersion: z.number().int().nonnegative(),
        name: boundedText(120),
        properties: z
          .object({
            appearance: z
              .object({
                defaultValue: boundedText(120),
                name: boundedText(120),
                options: z.array(boundedText(120)).min(2).max(20),
              })
              .strict(),
            label: z
              .object({
                defaultValue: boundedText(500),
                name: boundedText(120),
              })
              .strict(),
            state: z
              .object({
                defaultValue: boundedText(120),
                name: boundedText(120),
                options: z.array(boundedText(120)).min(2).max(20),
              })
              .strict(),
          })
          .strict(),
        slotId: z.literal("root"),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    schemaVersion: z.literal(FIGMA_BUTTON_PLAN_SCHEMA_VERSION),
    sharedBindings: z.array(plannedBindingSchema).length(3),
    source: z
      .object({
        assetId: stableAssetIdSchema,
        assetVersion: strictSemverSchema,
        contentDigest: contentDigestSchema,
        projectId: stableIdSegmentSchema,
      })
      .strict(),
    tokenSource: z
      .object({
        assetId: stableAssetIdSchema,
        assetVersion: strictSemverSchema,
        collectionStableId: stableAssetIdSchema,
        contentDigest: contentDigestSchema,
        projectId: stableIdSegmentSchema,
      })
      .strict(),
    typography: z
      .object({
        fontFamily: typographyVariableSchema,
        fontSize: typographyVariableSchema,
        fontStyleFallback: boundedText(120),
        fontWeight: typographyVariableSchema,
        letterSpacing: typographyVariableSchema,
        lineHeight: z
          .object({
            fallback: z.number().positive(),
            unit: z.literal("PERCENT"),
          })
          .strict(),
        tokenPath: stableAssetIdSchema,
      })
      .strict(),
    variants: z
      .array(
        z
          .object({
            bindings: z.array(plannedBindingSchema).min(2).max(5),
            displayName: boundedText(120),
            figmaName: boundedText(240),
            id: stableAssetIdSchema,
            selections: z
              .object({ appearance: boundedText(120), state: boundedText(120) })
              .strict(),
            slotId: stableAssetIdSchema,
            stableId: stableAssetIdSchema,
          })
          .strict(),
      )
      .length(4),
  })
  .strict()
  .superRefine((plan, context) => {
    const expectedRoot = `${plan.source.projectId}/component/${plan.source.assetId}/component-set/major-${String(plan.componentSet.majorVersion)}`;
    if (plan.componentSet.stableId !== expectedRoot) {
      context.addIssue({
        code: "custom",
        message: "Component Set identity does not match the source Component.",
        path: ["componentSet", "stableId"],
      });
    }
    if (
      Number(plan.source.assetVersion.split(".")[0]) !==
      plan.componentSet.majorVersion
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Component Set Major version does not match the source version.",
        path: ["componentSet", "majorVersion"],
      });
    }
    const expectedCollection = `${plan.tokenSource.projectId}/token-set/${plan.tokenSource.assetId}/variables/major-${plan.tokenSource.assetVersion.split(".")[0]}`;
    if (plan.tokenSource.collectionStableId !== expectedCollection) {
      context.addIssue({
        code: "custom",
        message: "Token Collection identity does not match the Token source.",
        path: ["tokenSource", "collectionStableId"],
      });
    }
    const variantIds = new Set<string>();
    const variantNames = new Set<string>();
    const selectionKeys = new Set<string>();
    for (const [index, variant] of plan.variants.entries()) {
      if (variant.stableId !== `${expectedRoot}/${variant.slotId}`) {
        context.addIssue({
          code: "custom",
          message:
            "Variant identity must derive from the Component Set and slot.",
          path: ["variants", index, "stableId"],
        });
      }
      if (
        variantIds.has(variant.stableId) ||
        variantNames.has(variant.figmaName)
      ) {
        context.addIssue({
          code: "custom",
          message: "Variant identities and Figma names must be unique.",
          path: ["variants", index],
        });
      }
      const selectionKey = `${variant.selections.appearance}/${variant.selections.state}`;
      const expectedName = `${plan.componentSet.properties.appearance.name}=${variant.selections.appearance}, ${plan.componentSet.properties.state.name}=${variant.selections.state}`;
      if (
        !plan.componentSet.properties.appearance.options.includes(
          variant.selections.appearance,
        ) ||
        !plan.componentSet.properties.state.options.includes(
          variant.selections.state,
        ) ||
        selectionKeys.has(selectionKey) ||
        variant.figmaName !== expectedName
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Every Variant must represent one unique declared selection with its canonical Figma name.",
          path: ["variants", index, "selections"],
        });
      }
      variantIds.add(variant.stableId);
      variantNames.add(variant.figmaName);
      selectionKeys.add(selectionKey);
    }
    const variablePrefix = `${plan.tokenSource.collectionStableId}/variable/`;
    const allBindings = [
      ...plan.sharedBindings,
      ...plan.variants.flatMap(({ bindings }) => bindings),
      plan.typography.fontFamily,
      plan.typography.fontSize,
      plan.typography.fontWeight,
      plan.typography.letterSpacing,
    ];
    allBindings.forEach((binding, index) => {
      if (!binding.variableStableId.startsWith(variablePrefix)) {
        context.addIssue({
          code: "custom",
          message:
            "Every Button Variable binding must belong to the declared Token Collection.",
          path: ["bindings", index],
        });
      }
    });
  });

export type FigmaButtonPlan = z.infer<typeof figmaButtonPlanSchema>;
type PlannedBinding = FigmaButtonPlan["sharedBindings"][number];
type TokenDefinition = TokenSet["modes"][number]["tokens"][number];

function fail(
  contract: ButtonComponentContract,
  message: string,
  issue: string,
): ToolkitResult<FigmaButtonPlan> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issue } },
      message,
      recoveryInstruction:
        "Correct the Button Contract or Token Set and regenerate the Figma plan.",
      target: {
        logicalId: contract.assetId,
        type: "component",
        version: contract.assetVersion,
      },
    }),
  );
}

function tokenPathFromReference(reference: string): string | undefined {
  return parseTokenReference(reference)?.join("/");
}

function resolveToken(
  tokenIndex: ReadonlyMap<string, TokenDefinition>,
  path: string,
  seen: ReadonlySet<string> = new Set(),
): TokenDefinition | undefined {
  if (seen.has(path)) return undefined;
  const token = tokenIndex.get(path);
  if (token === undefined || typeof token.$value !== "string") return token;
  const reference = tokenPathFromReference(token.$value);
  if (reference === undefined) return token;
  return resolveToken(tokenIndex, reference, new Set([...seen, path]));
}

function directValue(
  tokenIndex: ReadonlyMap<string, TokenDefinition>,
  reference: string,
): unknown {
  const path = tokenPathFromReference(reference);
  return path === undefined
    ? undefined
    : resolveToken(tokenIndex, path)?.$value;
}

function variableId(
  collectionStableId: string,
  reference: string,
): string | undefined {
  const path = tokenPathFromReference(reference);
  return path === undefined
    ? undefined
    : `${collectionStableId}/variable/${path}`;
}

function bindingFor(
  target: Exclude<ButtonBindingTarget, "label.typography">,
  reference: string,
  collectionStableId: string,
  tokenIndex: ReadonlyMap<string, TokenDefinition>,
): PlannedBinding | undefined {
  const stableId = variableId(collectionStableId, reference);
  const value = directValue(tokenIndex, reference);
  if (stableId === undefined) return undefined;
  if (
    target === "container.fill" ||
    target === "container.border-color" ||
    target === "label.fill"
  ) {
    if (
      typeof value !== "object" ||
      value === null ||
      !("components" in value) ||
      !Array.isArray(value.components) ||
      value.components.length !== 3
    )
      return undefined;
    const [r, g, b] = value.components as unknown[];
    if (![r, g, b].every((channel) => typeof channel === "number"))
      return undefined;
    return {
      fallback: {
        a:
          "alpha" in value && typeof value.alpha === "number" ? value.alpha : 1,
        b: b as number,
        g: g as number,
        r: r as number,
      },
      kind: "color",
      target,
      variableStableId: stableId,
    };
  }
  let fallback: number | undefined;
  if (typeof value === "number") fallback = value;
  if (
    typeof value === "object" &&
    value !== null &&
    "unit" in value &&
    value.unit === "px" &&
    "value" in value &&
    typeof value.value === "number"
  )
    fallback = value.value;
  return fallback === undefined
    ? undefined
    : { fallback, kind: "float", target, variableStableId: stableId };
}

function fontStyle(weight: unknown): string | undefined {
  if (typeof weight === "string" && weight.length > 0) return weight;
  if (typeof weight !== "number") return undefined;
  return new Map<number, string>([
    [100, "Thin"],
    [200, "Extra Light"],
    [300, "Light"],
    [400, "Regular"],
    [500, "Medium"],
    [600, "Semi Bold"],
    [700, "Bold"],
    [800, "Extra Bold"],
    [900, "Black"],
  ]).get(weight);
}

export function createFigmaButtonPlan(
  contractInput: unknown,
  tokenSetInput: unknown,
  componentDigest: string,
  tokenDigest: string,
): ToolkitResult<FigmaButtonPlan> {
  const validated = validateButtonComponentContractWithTokenSet(
    contractInput,
    tokenSetInput,
  );
  if (!validated.ok) return validated;
  const contract = validated.data;
  const tokenResult = validateTokenSet(tokenSetInput);
  if (!tokenResult.ok) return tokenResult;
  const tokenSet = tokenResult.data;
  const componentDigestResult = contentDigestSchema.safeParse(componentDigest);
  const tokenDigestResult = contentDigestSchema.safeParse(tokenDigest);
  if (!componentDigestResult.success || !tokenDigestResult.success) {
    return fail(
      contract,
      "The Button plan requires verified source digests.",
      "content_digest_invalid",
    );
  }
  if (
    contract.contentDigest !== undefined &&
    contract.contentDigest !== componentDigestResult.data
  ) {
    return fail(
      contract,
      "The verified digest does not match the Button Contract.",
      "component_digest_mismatch",
    );
  }
  if (
    tokenSet.contentDigest !== undefined &&
    tokenSet.contentDigest !== tokenDigestResult.data
  ) {
    return fail(
      contract,
      "The verified digest does not match the Button Token Set.",
      "token_digest_mismatch",
    );
  }
  const variablePlan = createFigmaVariablePlan(
    tokenSet,
    tokenDigestResult.data,
  );
  if (!variablePlan.ok) return variablePlan;

  const baseline = tokenSet.modes.find(({ id }) => id === tokenSet.defaultMode);
  if (baseline === undefined)
    return fail(
      contract,
      "The default Token mode is missing.",
      "default_mode_missing",
    );
  const tokenIndex = new Map(
    baseline.tokens.map((token) => [token.path.join("/"), token]),
  );
  const major = Number(contract.assetVersion.split(".")[0]);
  const rootStableId = `${contract.projectId}/component/${contract.assetId}/component-set/major-${String(major)}`;
  if (!Number.isSafeInteger(major) || rootStableId.length > 192) {
    return fail(
      contract,
      "The Button identity cannot be represented safely in Figma.",
      "figma_identity_invalid",
    );
  }
  const collectionStableId = variablePlan.data.collection.stableId;
  const sharedBindings = contract.sharedBindings
    .filter((binding) => binding.target !== "label.typography")
    .map((binding) =>
      bindingFor(
        binding.target as Exclude<ButtonBindingTarget, "label.typography">,
        binding.token,
        collectionStableId,
        tokenIndex,
      ),
    );
  if (sharedBindings.some((binding) => binding === undefined)) {
    return fail(
      contract,
      "A shared Button binding has no safe Figma mapping.",
      "shared_binding_mapping_failed",
    );
  }

  const typographyBinding = contract.sharedBindings.find(
    ({ target }) => target === "label.typography",
  );
  const typographyPath =
    typographyBinding === undefined
      ? undefined
      : tokenPathFromReference(typographyBinding.token);
  const typographyToken =
    typographyPath === undefined ? undefined : tokenIndex.get(typographyPath);
  const typographyValue = typographyToken?.$value;
  if (
    typeof typographyValue !== "object" ||
    typographyValue === null ||
    Array.isArray(typographyValue)
  ) {
    return fail(
      contract,
      "The Button typography Token is not a supported composite.",
      "typography_mapping_failed",
    );
  }
  const typographyRecord = typographyValue as Record<string, unknown>;
  const refs = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
  ] as const;
  if (refs.some((key) => typeof typographyRecord[key] !== "string")) {
    return fail(
      contract,
      "The Button typography Token has incomplete references.",
      "typography_mapping_failed",
    );
  }
  const typographyReferences = typographyRecord as Record<
    (typeof refs)[number],
    string
  >;
  const fontFamilyValue = directValue(
    tokenIndex,
    typographyReferences.fontFamily,
  );
  const fontSizeValue = directValue(tokenIndex, typographyReferences.fontSize);
  const fontWeightValue = directValue(
    tokenIndex,
    typographyReferences.fontWeight,
  );
  const letterSpacingValue = directValue(
    tokenIndex,
    typographyReferences.letterSpacing,
  );
  const lineHeightValue = directValue(
    tokenIndex,
    typographyReferences.lineHeight,
  );
  const family = Array.isArray(fontFamilyValue)
    ? (fontFamilyValue as unknown[])[0]
    : fontFamilyValue;
  const dimensionNumber = (value: unknown): number | undefined =>
    typeof value === "object" &&
    value !== null &&
    "unit" in value &&
    value.unit === "px" &&
    "value" in value &&
    typeof value.value === "number"
      ? value.value
      : undefined;
  const style = fontStyle(fontWeightValue);
  if (
    typeof family !== "string" ||
    dimensionNumber(fontSizeValue) === undefined ||
    style === undefined ||
    dimensionNumber(letterSpacingValue) === undefined ||
    typeof lineHeightValue !== "number"
  ) {
    return fail(
      contract,
      "The Button typography values cannot be mapped safely to Figma.",
      "typography_mapping_failed",
    );
  }
  const typographyVariableId = (reference: string): string =>
    `${collectionStableId}/variable/${tokenPathFromReference(reference) ?? "invalid"}`;

  const variants: FigmaButtonPlan["variants"] = [];
  for (const variant of contract.variants) {
    const bindings = variant.bindings.map((binding) =>
      bindingFor(
        binding.target as Exclude<ButtonBindingTarget, "label.typography">,
        binding.token,
        collectionStableId,
        tokenIndex,
      ),
    );
    if (bindings.some((binding) => binding === undefined)) {
      return fail(
        contract,
        `Variant '${variant.id}' has no safe Figma binding mapping.`,
        "variant_binding_mapping_failed",
      );
    }
    const appearanceProperty = contract.properties.find(
      ({ id }) => id === "appearance",
    );
    const stateProperty = contract.properties.find(({ id }) => id === "state");
    if (
      appearanceProperty?.kind !== "variant" ||
      stateProperty?.kind !== "variant"
    )
      throw new Error("Validated Button properties drifted.");
    const appearance = appearanceProperty.options.find(
      ({ id }) => id === variant.selections.appearance,
    )?.figmaValue;
    const state = stateProperty.options.find(
      ({ id }) => id === variant.selections.state,
    )?.figmaValue;
    if (appearance === undefined || state === undefined)
      throw new Error("Validated Button selections drifted.");
    variants.push({
      bindings: bindings as PlannedBinding[],
      displayName: variant.name,
      figmaName: `${appearanceProperty.figmaName}=${appearance}, ${stateProperty.figmaName}=${state}`,
      id: variant.id,
      selections: { appearance, state },
      slotId: variant.slotId,
      stableId: `${rootStableId}/${variant.slotId}`,
    });
  }
  const label = contract.properties.find(({ id }) => id === "label");
  const appearance = contract.properties.find(({ id }) => id === "appearance");
  const state = contract.properties.find(({ id }) => id === "state");
  if (
    label?.kind !== "text" ||
    appearance?.kind !== "variant" ||
    state?.kind !== "variant"
  )
    throw new Error("Validated Button properties drifted.");
  const optionValue = (property: typeof appearance, optionId: string): string =>
    property.options.find(({ id }) => id === optionId)?.figmaValue ?? optionId;
  const parsed = figmaButtonPlanSchema.safeParse({
    componentSet: {
      description: contract.description,
      majorVersion: major,
      name:
        major === 1 ? contract.name : `${contract.name} / v${String(major)}`,
      properties: {
        appearance: {
          defaultValue: optionValue(appearance, appearance.defaultOptionId),
          name: appearance.figmaName,
          options: appearance.options.map(({ figmaValue }) => figmaValue),
        },
        label: { defaultValue: label.defaultValue, name: label.figmaName },
        state: {
          defaultValue: optionValue(state, state.defaultOptionId),
          name: state.figmaName,
          options: state.options.map(({ figmaValue }) => figmaValue),
        },
      },
      slotId: "root",
      stableId: rootStableId,
    },
    schemaVersion: FIGMA_BUTTON_PLAN_SCHEMA_VERSION,
    sharedBindings,
    source: {
      assetId: contract.assetId,
      assetVersion: contract.assetVersion,
      contentDigest: componentDigestResult.data,
      projectId: contract.projectId,
    },
    tokenSource: {
      assetId: tokenSet.assetId,
      assetVersion: tokenSet.assetVersion,
      collectionStableId,
      contentDigest: tokenDigestResult.data,
      projectId: tokenSet.projectId,
    },
    typography: {
      fontFamily: {
        fallback: family,
        variableStableId: typographyVariableId(typographyReferences.fontFamily),
      },
      fontSize: {
        fallback: dimensionNumber(fontSizeValue),
        variableStableId: typographyVariableId(typographyReferences.fontSize),
      },
      fontStyleFallback: style,
      fontWeight: {
        fallback: fontWeightValue,
        variableStableId: typographyVariableId(typographyReferences.fontWeight),
      },
      letterSpacing: {
        fallback: dimensionNumber(letterSpacingValue),
        variableStableId: typographyVariableId(
          typographyReferences.letterSpacing,
        ),
      },
      lineHeight: { fallback: lineHeightValue * 100, unit: "PERCENT" },
      tokenPath: typographyPath,
    },
    variants,
  });
  return parsed.success
    ? createSuccessResult(parsed.data, variablePlan.warnings)
    : fail(
        contract,
        "The generated Button plan failed its strict invariant check.",
        "generated_plan_invalid",
      );
}
