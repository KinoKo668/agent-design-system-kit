import * as z from "zod";

import { createToolkitError } from "./errors.js";
import { createFigmaVariablePlan } from "./figma-variable-plan.js";
import {
  validateInputComponentContractWithTokenSet,
  type InputBindingTarget,
  type InputComponentContract,
} from "./input-contract.js";
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

export const FIGMA_INPUT_PLAN_SCHEMA_VERSION = "1.0.0" as const;

const boundedText = (maximum: number): z.ZodString =>
  z.string().min(1).max(maximum);

const colorSchema = z
  .object({
    a: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    r: z.number().min(0).max(1),
  })
  .strict();

const inputColorTargets = [
  "field.background",
  "field.border",
  "label.fill",
  "support.fill",
  "value.fill",
] as const;
const inputFloatTargets = [
  "field.border-width",
  "field.height",
  "field.padding-inline",
  "field.radius",
  "layout.gap",
] as const;

const plannedBindingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      fallback: colorSchema,
      kind: z.literal("color"),
      target: z.enum(inputColorTargets),
      variableStableId: stableAssetIdSchema,
    })
    .strict(),
  z
    .object({
      fallback: z.number().finite(),
      kind: z.literal("float"),
      target: z.enum(inputFloatTargets),
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

const typographyPlanSchema = z
  .object({
    fontFamily: typographyVariableSchema,
    fontSize: typographyVariableSchema,
    fontStyleFallback: boundedText(120),
    fontWeight: typographyVariableSchema,
    letterSpacing: typographyVariableSchema,
    lineHeight: z
      .object({ fallback: z.number().positive(), unit: z.literal("PERCENT") })
      .strict(),
    tokenPath: stableAssetIdSchema,
  })
  .strict();

const variantPropertyPlanSchema = z
  .object({
    defaultValue: boundedText(120),
    name: boundedText(120),
    options: z.array(boundedText(120)).min(2).max(20),
  })
  .strict();

const textPropertyPlanSchema = z
  .object({ defaultValue: boundedText(500), name: boundedText(120) })
  .strict();

export const figmaInputPlanSchema = z
  .object({
    accessibility: z
      .object({
        disabledStateRequired: z.literal(true),
        errorMessageNearField: z.literal(true),
        errorNotColorOnly: z.literal(true),
        focusIndicatorRequired: z.literal(true),
        minimumInteractiveTarget: z.literal(44),
        minimumTextContrast: z.literal(4.5),
        placeholderAsOnlyLabelAllowed: z.literal(false),
        visibleLabelRequired: z.literal(true),
      })
      .strict(),
    componentSet: z
      .object({
        description: boundedText(2_000),
        majorVersion: z.number().int().nonnegative(),
        name: boundedText(120),
        properties: z
          .object({
            content: variantPropertyPlanSchema,
            label: textPropertyPlanSchema,
            state: variantPropertyPlanSchema,
            supportingText: textPropertyPlanSchema,
            text: textPropertyPlanSchema,
          })
          .strict(),
        slotId: z.literal("root"),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    layout: z
      .object({
        fieldHeight: z.literal(48),
        gap: z.literal(6),
        paddingInline: z.literal(12),
        width: z.literal(320),
      })
      .strict(),
    schemaVersion: z.literal(FIGMA_INPUT_PLAN_SCHEMA_VERSION),
    sharedBindings: z.array(plannedBindingSchema).length(6),
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
        label: typographyPlanSchema,
        support: typographyPlanSchema,
        value: typographyPlanSchema,
      })
      .strict(),
    variants: z
      .array(
        z
          .object({
            bindings: z.array(plannedBindingSchema).length(4),
            displayName: boundedText(120),
            figmaName: boundedText(240),
            id: stableAssetIdSchema,
            selections: z
              .object({ content: boundedText(120), state: boundedText(120) })
              .strict(),
            slotId: stableAssetIdSchema,
            stableId: stableAssetIdSchema,
            textDefaults: z
              .object({
                supportingText: boundedText(500),
                text: boundedText(500),
              })
              .strict(),
          })
          .strict(),
      )
      .length(8),
  })
  .strict()
  .superRefine((plan, context) => {
    const expectedProperties = {
      content: {
        defaultValue: "Empty",
        name: "Content",
        options: ["Empty", "Filled"],
      },
      label: { defaultValue: "Email address", name: "Label" },
      state: {
        defaultValue: "Default",
        name: "State",
        options: ["Default", "Focused", "Error", "Disabled"],
      },
      supportingText: {
        defaultValue: "We only use this for account updates.",
        name: "Supporting text",
      },
      text: { defaultValue: "name@example.com", name: "Text" },
    };
    if (
      JSON.stringify(plan.componentSet.properties) !==
      JSON.stringify(expectedProperties)
    ) {
      context.addIssue({
        code: "custom",
        message: "Input properties must match the governed input-v1 profile.",
        path: ["componentSet", "properties"],
      });
    }
    const targetKey = (bindings: readonly PlannedBinding[]): string =>
      bindings
        .map(({ target }) => target)
        .sort()
        .join("|");
    if (
      targetKey(plan.sharedBindings) !==
      [
        "field.background",
        "field.height",
        "field.padding-inline",
        "field.radius",
        "label.fill",
        "layout.gap",
      ].join("|")
    ) {
      context.addIssue({
        code: "custom",
        message: "Input shared bindings must cover the exact governed targets.",
        path: ["sharedBindings"],
      });
    }
    const root = `${plan.source.projectId}/component/${plan.source.assetId}/component-set/major-${String(plan.componentSet.majorVersion)}`;
    if (
      plan.componentSet.stableId !== root ||
      Number(plan.source.assetVersion.split(".")[0]) !==
        plan.componentSet.majorVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Input Component Set identity must match its source Major.",
        path: ["componentSet"],
      });
    }
    const collection = `${plan.tokenSource.projectId}/token-set/${plan.tokenSource.assetId}/variables/major-${plan.tokenSource.assetVersion.split(".")[0]}`;
    if (plan.tokenSource.collectionStableId !== collection) {
      context.addIssue({
        code: "custom",
        message: "Input Token Collection identity must match its source.",
        path: ["tokenSource", "collectionStableId"],
      });
    }
    const variablePrefix = `${collection}/variable/`;
    const bindings = [
      ...plan.sharedBindings,
      ...plan.variants.flatMap(
        ({ bindings: variantBindings }) => variantBindings,
      ),
      ...Object.values(plan.typography).flatMap((typography) => [
        typography.fontFamily,
        typography.fontSize,
        typography.fontWeight,
        typography.letterSpacing,
      ]),
    ];
    if (
      bindings.some(
        ({ variableStableId }) => !variableStableId.startsWith(variablePrefix),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Every Input Variable must belong to its Token Collection.",
        path: ["bindings"],
      });
    }
    const names = new Set<string>();
    const selections = new Set<string>();
    const expectedVariantTargets = [
      "field.border",
      "field.border-width",
      "support.fill",
      "value.fill",
    ].join("|");
    for (const [index, variant] of plan.variants.entries()) {
      const key = `${variant.selections.state}/${variant.selections.content}`;
      const expectedName = `${plan.componentSet.properties.state.name}=${variant.selections.state}, ${plan.componentSet.properties.content.name}=${variant.selections.content}`;
      if (
        variant.stableId !== `${root}/${variant.slotId}` ||
        variant.figmaName !== expectedName ||
        targetKey(variant.bindings) !== expectedVariantTargets ||
        names.has(variant.figmaName) ||
        selections.has(key)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Every Input Variant must have one canonical identity and selection.",
          path: ["variants", index],
        });
      }
      names.add(variant.figmaName);
      selections.add(key);
    }
    const expectedSelections = new Set([
      "Default/Empty",
      "Default/Filled",
      "Focused/Empty",
      "Focused/Filled",
      "Error/Empty",
      "Error/Filled",
      "Disabled/Empty",
      "Disabled/Filled",
    ]);
    if (
      [...selections].some((selection) => !expectedSelections.has(selection))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Input Variants must cover the exact State and Content matrix.",
        path: ["variants"],
      });
    }
  });

export type FigmaInputPlan = z.infer<typeof figmaInputPlanSchema>;
type PlannedBinding = FigmaInputPlan["sharedBindings"][number];
type TypographyPlan = FigmaInputPlan["typography"]["label"];
type TokenDefinition = TokenSet["modes"][number]["tokens"][number];

function fail(
  contract: InputComponentContract,
  message: string,
  issue: string,
): ToolkitResult<FigmaInputPlan> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issue } },
      message,
      recoveryInstruction:
        "Correct the Input Contract or Token Set and regenerate the Figma plan.",
      target: {
        logicalId: contract.assetId,
        type: "component",
        version: contract.assetVersion,
      },
    }),
  );
}

function tokenPath(reference: string): string | undefined {
  return parseTokenReference(reference)?.join("/");
}

function resolveToken(
  index: ReadonlyMap<string, TokenDefinition>,
  path: string,
  seen: ReadonlySet<string> = new Set(),
): TokenDefinition | undefined {
  if (seen.has(path)) return undefined;
  const token = index.get(path);
  if (token === undefined || typeof token.$value !== "string") return token;
  const next = tokenPath(token.$value);
  return next === undefined
    ? token
    : resolveToken(index, next, new Set([...seen, path]));
}

function directValue(
  index: ReadonlyMap<string, TokenDefinition>,
  reference: string,
): unknown {
  const path = tokenPath(reference);
  return path === undefined ? undefined : resolveToken(index, path)?.$value;
}

function variableId(
  collectionStableId: string,
  reference: string,
): string | undefined {
  const path = tokenPath(reference);
  return path === undefined
    ? undefined
    : `${collectionStableId}/variable/${path}`;
}

function dimension(value: unknown): number | undefined {
  return typeof value === "object" &&
    value !== null &&
    "unit" in value &&
    value.unit === "px" &&
    "value" in value &&
    typeof value.value === "number"
    ? value.value
    : undefined;
}

function bindingFor(
  target: Exclude<
    InputBindingTarget,
    "label.typography" | "support.typography" | "value.typography"
  >,
  reference: string,
  collectionStableId: string,
  index: ReadonlyMap<string, TokenDefinition>,
): PlannedBinding | undefined {
  const stableId = variableId(collectionStableId, reference);
  const value = directValue(index, reference);
  if (stableId === undefined) return undefined;
  if ((inputColorTargets as readonly string[]).includes(target)) {
    if (
      typeof value !== "object" ||
      value === null ||
      !("components" in value) ||
      !Array.isArray(value.components) ||
      value.components.length !== 3 ||
      !value.components.every((channel) => typeof channel === "number")
    ) {
      return undefined;
    }
    const [r, g, b] = value.components as [number, number, number];
    return {
      fallback: {
        a:
          "alpha" in value && typeof value.alpha === "number" ? value.alpha : 1,
        b,
        g,
        r,
      },
      kind: "color",
      target: target as (typeof inputColorTargets)[number],
      variableStableId: stableId,
    };
  }
  const fallback = dimension(value);
  return fallback === undefined
    ? undefined
    : {
        fallback,
        kind: "float",
        target: target as (typeof inputFloatTargets)[number],
        variableStableId: stableId,
      };
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

function typographyFor(
  reference: string,
  collectionStableId: string,
  index: ReadonlyMap<string, TokenDefinition>,
): TypographyPlan | undefined {
  const path = tokenPath(reference);
  const token = path === undefined ? undefined : index.get(path);
  const value = token?.$value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
  ] as const;
  if (keys.some((key) => typeof record[key] !== "string")) return undefined;
  const refs = record as Record<(typeof keys)[number], string>;
  const familyValue = directValue(index, refs.fontFamily);
  const family =
    typeof familyValue === "string"
      ? familyValue
      : Array.isArray(familyValue)
        ? (familyValue as unknown[]).find(
            (candidate): candidate is string => typeof candidate === "string",
          )
        : undefined;
  const fontSize = dimension(directValue(index, refs.fontSize));
  const weight = directValue(index, refs.fontWeight);
  const style = fontStyle(weight);
  const letterSpacing = dimension(directValue(index, refs.letterSpacing));
  const lineHeight = directValue(index, refs.lineHeight);
  const ids = {
    fontFamily: variableId(collectionStableId, refs.fontFamily),
    fontSize: variableId(collectionStableId, refs.fontSize),
    fontWeight: variableId(collectionStableId, refs.fontWeight),
    letterSpacing: variableId(collectionStableId, refs.letterSpacing),
  };
  if (
    typeof family !== "string" ||
    fontSize === undefined ||
    typeof weight !== "number" ||
    style === undefined ||
    letterSpacing === undefined ||
    typeof lineHeight !== "number" ||
    path === undefined ||
    Object.values(ids).some((id) => id === undefined)
  ) {
    return undefined;
  }
  return {
    fontFamily: { fallback: family, variableStableId: ids.fontFamily! },
    fontSize: { fallback: fontSize, variableStableId: ids.fontSize! },
    fontStyleFallback: style,
    fontWeight: { fallback: weight, variableStableId: ids.fontWeight! },
    letterSpacing: {
      fallback: letterSpacing,
      variableStableId: ids.letterSpacing!,
    },
    lineHeight: { fallback: lineHeight * 100, unit: "PERCENT" },
    tokenPath: path,
  };
}

export function createFigmaInputPlan(
  contractInput: unknown,
  tokenSetInput: unknown,
  componentDigest: string,
  tokenDigest: string,
): ToolkitResult<FigmaInputPlan> {
  const validated = validateInputComponentContractWithTokenSet(
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
      "The Input plan requires verified source digests.",
      "content_digest_invalid",
    );
  }
  if (
    contract.contentDigest !== undefined &&
    contract.contentDigest !== componentDigestResult.data
  ) {
    return fail(
      contract,
      "The verified digest does not match the Input Contract.",
      "component_digest_mismatch",
    );
  }
  if (
    tokenSet.contentDigest !== undefined &&
    tokenSet.contentDigest !== tokenDigestResult.data
  ) {
    return fail(
      contract,
      "The verified digest does not match the Input Token Set.",
      "token_digest_mismatch",
    );
  }
  const variablePlan = createFigmaVariablePlan(
    tokenSet,
    tokenDigestResult.data,
  );
  if (!variablePlan.ok) return variablePlan;
  const baseline = tokenSet.modes.find(({ id }) => id === tokenSet.defaultMode);
  if (baseline === undefined) {
    return fail(
      contract,
      "The default Token mode is missing.",
      "default_mode_missing",
    );
  }
  const index = new Map(
    baseline.tokens.map((token) => [token.path.join("/"), token]),
  );
  const major = Number(contract.assetVersion.split(".")[0]);
  const root = `${contract.projectId}/component/${contract.assetId}/component-set/major-${String(major)}`;
  if (!Number.isSafeInteger(major) || root.length > 192) {
    return fail(
      contract,
      "The Input identity cannot be represented safely in Figma.",
      "figma_identity_invalid",
    );
  }
  const collectionStableId = variablePlan.data.collection.stableId;
  const typographyTargets = new Set([
    "label.typography",
    "support.typography",
    "value.typography",
  ]);
  const sharedBindings = contract.sharedBindings
    .filter(({ target }) => !typographyTargets.has(target))
    .map((binding) =>
      bindingFor(
        binding.target as Exclude<
          InputBindingTarget,
          "label.typography" | "support.typography" | "value.typography"
        >,
        binding.token,
        collectionStableId,
        index,
      ),
    );
  if (sharedBindings.some((binding) => binding === undefined)) {
    return fail(
      contract,
      "A shared Input binding has no safe Figma mapping.",
      "shared_binding_mapping_failed",
    );
  }
  const typographyByTarget = (target: string): TypographyPlan | undefined => {
    const reference = contract.sharedBindings.find(
      (binding) => binding.target === target,
    )?.token;
    return reference === undefined
      ? undefined
      : typographyFor(reference, collectionStableId, index);
  };
  const labelTypography = typographyByTarget("label.typography");
  const valueTypography = typographyByTarget("value.typography");
  const supportTypography = typographyByTarget("support.typography");
  if (
    labelTypography === undefined ||
    valueTypography === undefined ||
    supportTypography === undefined
  ) {
    return fail(
      contract,
      "An Input typography Token cannot be mapped safely to Figma.",
      "typography_mapping_failed",
    );
  }
  const state = contract.properties.find(
    (property) => property.kind === "variant" && property.id === "state",
  );
  const content = contract.properties.find(
    (property) => property.kind === "variant" && property.id === "content",
  );
  const label = contract.properties.find(
    (property) => property.kind === "text" && property.id === "label",
  );
  const text = contract.properties.find(
    (property) => property.kind === "text" && property.id === "text",
  );
  const supportingText = contract.properties.find(
    (property) => property.kind === "text" && property.id === "supporting-text",
  );
  if (
    state?.kind !== "variant" ||
    content?.kind !== "variant" ||
    label?.kind !== "text" ||
    text?.kind !== "text" ||
    supportingText?.kind !== "text"
  ) {
    throw new Error("Validated Input properties drifted.");
  }
  type VariantProperty = Extract<
    InputComponentContract["properties"][number],
    { kind: "variant" }
  >;
  const option = (property: VariantProperty, id: string): string | undefined =>
    property.options.find((candidate) => candidate.id === id)?.figmaValue;
  const variants: FigmaInputPlan["variants"] = [];
  for (const variant of contract.variants) {
    const stateValue = option(state, variant.selections.state);
    const contentValue = option(content, variant.selections.content);
    const bindings = variant.bindings.map((binding) =>
      bindingFor(
        binding.target as Exclude<
          InputBindingTarget,
          "label.typography" | "support.typography" | "value.typography"
        >,
        binding.token,
        collectionStableId,
        index,
      ),
    );
    if (
      stateValue === undefined ||
      contentValue === undefined ||
      bindings.some((binding) => binding === undefined)
    ) {
      return fail(
        contract,
        `Input Variant '${variant.id}' cannot be mapped safely to Figma.`,
        "variant_mapping_failed",
      );
    }
    variants.push({
      bindings: bindings as PlannedBinding[],
      displayName: variant.name,
      figmaName: `${state.figmaName}=${stateValue}, ${content.figmaName}=${contentValue}`,
      id: variant.id,
      selections: { content: contentValue, state: stateValue },
      slotId: variant.slotId,
      stableId: `${root}/${variant.slotId}`,
      textDefaults: variant.textDefaults,
    });
  }
  const propertyPlan = (
    property: VariantProperty,
  ): z.infer<typeof variantPropertyPlanSchema> => ({
    defaultValue:
      option(property, property.defaultOptionId) ?? property.defaultOptionId,
    name: property.figmaName,
    options: property.options.map(({ figmaValue }) => figmaValue),
  });
  const parsed = figmaInputPlanSchema.safeParse({
    accessibility: contract.accessibility,
    componentSet: {
      description: contract.description,
      majorVersion: major,
      name:
        major === 1 ? contract.name : `${contract.name} / v${String(major)}`,
      properties: {
        content: propertyPlan(content),
        label: { defaultValue: label.defaultValue, name: label.figmaName },
        state: propertyPlan(state),
        supportingText: {
          defaultValue: supportingText.defaultValue,
          name: supportingText.figmaName,
        },
        text: { defaultValue: text.defaultValue, name: text.figmaName },
      },
      slotId: "root",
      stableId: root,
    },
    layout: contract.layout,
    schemaVersion: FIGMA_INPUT_PLAN_SCHEMA_VERSION,
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
      label: labelTypography,
      support: supportTypography,
      value: valueTypography,
    },
    variants,
  });
  return parsed.success
    ? createSuccessResult(parsed.data, variablePlan.warnings)
    : fail(
        contract,
        "The generated Input plan failed its strict invariant check.",
        "generated_plan_invalid",
      );
}
