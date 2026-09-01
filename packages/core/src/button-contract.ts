import * as z from "zod";

import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { FailureResult, ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import {
  getProvidedSchemaVersion,
  toJsonPointer,
  toValidationIssues,
  type SchemaValidationIssue,
} from "./schema-validation.js";
import {
  TOKEN_SET_ASSET_TYPE,
  parseTokenReference,
  tokenReferenceSchema,
  validateTokenSet,
  type TokenSet,
  type TokenType,
} from "./token-set.js";

export const BUTTON_CONTRACT_SCHEMA_VERSION = "1.0.0" as const;
export const COMPONENT_ASSET_TYPE = "component" as const;
export const BUTTON_CONTRACT_PROFILE = "button-v1" as const;

export const BUTTON_BINDING_TARGETS = [
  "container.fill",
  "container.height",
  "container.padding-inline",
  "container.border-color",
  "container.border-width",
  "container.radius",
  "container.opacity",
  "label.fill",
  "label.typography",
] as const;

export type ButtonBindingTarget = (typeof BUTTON_BINDING_TARGETS)[number];

export const BUTTON_BINDING_TARGET_TYPES = {
  "container.border-color": "color",
  "container.border-width": "dimension",
  "container.fill": "color",
  "container.height": "dimension",
  "container.opacity": "number",
  "container.padding-inline": "dimension",
  "container.radius": "dimension",
  "label.fill": "color",
  "label.typography": "typography",
} as const satisfies Record<ButtonBindingTarget, TokenType>;

const BUTTON_PROPERTY_IDS = ["label", "appearance", "state"] as const;
const BUTTON_PROPERTY_ID_SET: ReadonlySet<string> = new Set(
  BUTTON_PROPERTY_IDS,
);
const BUTTON_VARIANT_PROPERTY_IDS = ["appearance", "state"] as const;
const BUTTON_VARIANT_PROPERTY_ID_SET: ReadonlySet<string> = new Set(
  BUTTON_VARIANT_PROPERTY_IDS,
);
const SHARED_BINDING_TARGETS = [
  "container.height",
  "container.padding-inline",
  "container.radius",
  "label.typography",
] as const satisfies readonly ButtonBindingTarget[];

function requiredText(maxLength: number): z.ZodString {
  return z
    .string()
    .min(1, "Must not be empty.")
    .max(maxLength, `Must contain at most ${String(maxLength)} characters.`)
    .refine((value) => value.trim() === value, {
      message: "Must not start or end with whitespace.",
    });
}

const figmaNameSchema = requiredText(120).refine(
  (value) => !/[=#]/u.test(value),
  "Figma property names and values must not contain '=' or '#'.",
);

const propertyCommonShape = {
  description: requiredText(500),
  figmaName: figmaNameSchema,
  id: stableIdSegmentSchema,
};

const textPropertySchema = z.strictObject({
  ...propertyCommonShape,
  defaultValue: requiredText(500),
  kind: z.literal("text"),
  required: z.boolean(),
});

const variantOptionSchema = z.strictObject({
  description: requiredText(500),
  figmaValue: figmaNameSchema,
  id: stableIdSegmentSchema,
});

const variantPropertySchema = z.strictObject({
  ...propertyCommonShape,
  defaultOptionId: stableIdSegmentSchema,
  kind: z.literal("variant"),
  options: z.array(variantOptionSchema).min(2).max(20),
});

export const buttonComponentPropertySchema = z.discriminatedUnion("kind", [
  textPropertySchema,
  variantPropertySchema,
]);

export const buttonTokenBindingSchema = z
  .strictObject({
    target: z.enum(BUTTON_BINDING_TARGETS),
    token: tokenReferenceSchema,
  })
  .superRefine((binding, context) => {
    if (parseTokenReference(binding.token)?.[0] !== "semantic") {
      context.addIssue({
        code: "custom",
        message: "Button bindings must reference semantic tokens.",
        path: ["token"],
      });
    }
  });

export const buttonVariantSchema = z.strictObject({
  bindings: z.array(buttonTokenBindingSchema).min(2).max(8),
  id: stableAssetIdSchema,
  name: requiredText(120),
  selections: z.record(stableIdSegmentSchema, stableIdSegmentSchema),
  slotId: stableAssetIdSchema,
});

const tokenSourceSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetType: z.literal(TOKEN_SET_ASSET_TYPE),
  assetVersion: strictSemverSchema,
  projectId: stableIdSegmentSchema,
});

const buttonLayoutSchema = z.strictObject({
  counterAxisAlignment: z.literal("center"),
  counterAxisSizing: z.literal("fixed"),
  direction: z.literal("horizontal"),
  primaryAxisAlignment: z.literal("center"),
  primaryAxisSizing: z.literal("hug"),
});

const buttonAccessibilitySchema = z.strictObject({
  accessibleNamePropertyId: z.literal("label"),
  disabledOptionId: z.literal("disabled"),
  disabledPropertyId: z.literal("state"),
  role: z.literal("button"),
});

type ButtonComponentProperty = z.infer<typeof buttonComponentPropertySchema>;
type ButtonTokenBinding = z.infer<typeof buttonTokenBindingSchema>;
type ButtonVariant = z.infer<typeof buttonVariantSchema>;

function addIssue(
  context: z.RefinementCtx,
  path: readonly (number | string)[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

function findDuplicateIndexes(
  values: readonly string[],
  normalize: (value: string) => string = (value) => value,
): readonly number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  values.forEach((value, index) => {
    const normalized = normalize(value);
    if (seen.has(normalized)) {
      duplicates.push(index);
    }
    seen.add(normalized);
  });
  return duplicates;
}

function validatePropertyUniqueness(
  properties: readonly ButtonComponentProperty[],
  context: z.RefinementCtx,
): void {
  for (const index of findDuplicateIndexes(properties.map(({ id }) => id))) {
    addIssue(context, ["properties", index, "id"], "Duplicate property id.");
  }

  for (const index of findDuplicateIndexes(
    properties.map(({ figmaName }) => figmaName),
    (value) => value.toLocaleLowerCase("en-US"),
  )) {
    addIssue(
      context,
      ["properties", index, "figmaName"],
      "Figma property names must be unique ignoring case.",
    );
  }

  properties.forEach((property, propertyIndex) => {
    if (property.kind !== "variant") {
      return;
    }

    for (const optionIndex of findDuplicateIndexes(
      property.options.map(({ id }) => id),
    )) {
      addIssue(
        context,
        ["properties", propertyIndex, "options", optionIndex, "id"],
        `Duplicate option id in property '${property.id}'.`,
      );
    }

    for (const optionIndex of findDuplicateIndexes(
      property.options.map(({ figmaValue }) => figmaValue),
      (value) => value.toLocaleLowerCase("en-US"),
    )) {
      addIssue(
        context,
        ["properties", propertyIndex, "options", optionIndex, "figmaValue"],
        `Figma values in property '${property.id}' must be unique ignoring case.`,
      );
    }

    if (!property.options.some(({ id }) => id === property.defaultOptionId)) {
      addIssue(
        context,
        ["properties", propertyIndex, "defaultOptionId"],
        `Default option '${property.defaultOptionId}' does not exist.`,
      );
    }
  });
}

function validateFrozenButtonProperties(
  properties: readonly ButtonComponentProperty[],
  context: z.RefinementCtx,
): void {
  const propertyIndex = new Map(
    properties.map((property, index) => [property.id, { index, property }]),
  );

  properties.forEach((property, index) => {
    if (!BUTTON_PROPERTY_ID_SET.has(property.id)) {
      addIssue(
        context,
        ["properties", index, "id"],
        `Button v1 does not support property '${property.id}'.`,
      );
    }
  });

  for (const propertyId of BUTTON_PROPERTY_IDS) {
    if (!propertyIndex.has(propertyId)) {
      addIssue(
        context,
        ["properties"],
        `Button v1 requires property '${propertyId}'.`,
      );
    }
  }

  const label = propertyIndex.get("label");
  if (
    label !== undefined &&
    (label.property.kind !== "text" ||
      label.property.figmaName !== "Label" ||
      label.property.defaultValue !== "Button" ||
      !label.property.required)
  ) {
    addIssue(
      context,
      ["properties", label.index],
      "The Label property must be required text named 'Label' with default 'Button'.",
    );
  }

  const expectedVariantProperties = {
    appearance: {
      defaultOptionId: "primary",
      figmaName: "Appearance",
      options: { primary: "Primary", secondary: "Secondary" },
    },
    state: {
      defaultOptionId: "default",
      figmaName: "State",
      options: { default: "Default", disabled: "Disabled" },
    },
  } as const;

  for (const propertyId of BUTTON_VARIANT_PROPERTY_IDS) {
    const entry = propertyIndex.get(propertyId);
    if (entry === undefined) {
      continue;
    }
    const expected = expectedVariantProperties[propertyId];
    if (entry.property.kind !== "variant") {
      addIssue(
        context,
        ["properties", entry.index, "kind"],
        `Property '${propertyId}' must be a Variant property.`,
      );
      continue;
    }

    if (entry.property.figmaName !== expected.figmaName) {
      addIssue(
        context,
        ["properties", entry.index, "figmaName"],
        `Property '${propertyId}' must use Figma name '${expected.figmaName}'.`,
      );
    }
    if (entry.property.defaultOptionId !== expected.defaultOptionId) {
      addIssue(
        context,
        ["properties", entry.index, "defaultOptionId"],
        `Property '${propertyId}' must default to '${expected.defaultOptionId}'.`,
      );
    }

    const expectedOptions: Readonly<Record<string, string>> = expected.options;
    const actualOptions = new Map(
      entry.property.options.map((option) => [option.id, option.figmaValue]),
    );
    for (const [optionId, figmaValue] of Object.entries(expectedOptions)) {
      if (actualOptions.get(optionId) !== figmaValue) {
        addIssue(
          context,
          ["properties", entry.index, "options"],
          `Property '${propertyId}' requires option '${optionId}' mapped to '${figmaValue}'.`,
        );
      }
    }
    for (const [optionIndex, option] of entry.property.options.entries()) {
      if (!Object.hasOwn(expectedOptions, option.id)) {
        addIssue(
          context,
          ["properties", entry.index, "options", optionIndex, "id"],
          `Button v1 does not support option '${option.id}' for '${propertyId}'.`,
        );
      }
    }
  }
}

function expectedVariantTargets(
  selections: Readonly<Record<string, string>>,
): ReadonlySet<ButtonBindingTarget> {
  const targets = new Set<ButtonBindingTarget>([
    "container.fill",
    "label.fill",
  ]);
  if (selections.appearance === "secondary") {
    targets.add("container.border-color");
    targets.add("container.border-width");
  }
  if (selections.state === "disabled") {
    targets.add("container.opacity");
  }
  return targets;
}

function validateBindingTargets(
  bindings: readonly ButtonTokenBinding[],
  expectedTargets: ReadonlySet<ButtonBindingTarget>,
  path: readonly (number | string)[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<ButtonBindingTarget>();
  bindings.forEach((binding, bindingIndex) => {
    if (seen.has(binding.target)) {
      addIssue(
        context,
        [...path, bindingIndex, "target"],
        `Duplicate binding target '${binding.target}'.`,
      );
    }
    seen.add(binding.target);
    if (!expectedTargets.has(binding.target)) {
      addIssue(
        context,
        [...path, bindingIndex, "target"],
        `Binding target '${binding.target}' is not allowed here.`,
      );
    }
  });

  for (const target of expectedTargets) {
    if (!seen.has(target)) {
      addIssue(
        context,
        path,
        `Required binding target '${target}' is missing.`,
      );
    }
  }
}

function validateVariants(
  variants: readonly ButtonVariant[],
  context: z.RefinementCtx,
): void {
  const expectedCombinations = new Set([
    "primary/default",
    "primary/disabled",
    "secondary/default",
    "secondary/disabled",
  ]);
  const seenCombinations = new Set<string>();
  const seenIds = new Set<string>();
  const seenSlots = new Set<string>();

  variants.forEach((variant, variantIndex) => {
    for (const propertyId of BUTTON_VARIANT_PROPERTY_IDS) {
      if (!Object.hasOwn(variant.selections, propertyId)) {
        addIssue(
          context,
          ["variants", variantIndex, "selections"],
          `Variant must select '${propertyId}'.`,
        );
      }
    }
    for (const key of Object.keys(variant.selections)) {
      if (!BUTTON_VARIANT_PROPERTY_ID_SET.has(key)) {
        addIssue(
          context,
          ["variants", variantIndex, "selections", key],
          `Selection '${key}' is not a Button v1 Variant property.`,
        );
      }
    }

    const appearance = variant.selections.appearance;
    const state = variant.selections.state;
    const combination = `${appearance ?? "missing"}/${state ?? "missing"}`;
    if (!expectedCombinations.has(combination)) {
      addIssue(
        context,
        ["variants", variantIndex, "selections"],
        `Unsupported Button v1 combination '${combination}'.`,
      );
    }
    if (seenCombinations.has(combination)) {
      addIssue(
        context,
        ["variants", variantIndex, "selections"],
        `Duplicate Variant combination '${combination}'.`,
      );
    }
    seenCombinations.add(combination);

    const expectedId = `appearance-${appearance ?? "missing"}/state-${state ?? "missing"}`;
    if (variant.id !== expectedId) {
      addIssue(
        context,
        ["variants", variantIndex, "id"],
        `Variant id must be '${expectedId}'.`,
      );
    }
    const expectedSlot = `variant/${expectedId}`;
    if (variant.slotId !== expectedSlot) {
      addIssue(
        context,
        ["variants", variantIndex, "slotId"],
        `Variant slotId must be '${expectedSlot}'.`,
      );
    }
    const expectedName = `${appearance === "primary" ? "Primary" : "Secondary"} / ${state === "default" ? "Default" : "Disabled"}`;
    if (variant.name !== expectedName) {
      addIssue(
        context,
        ["variants", variantIndex, "name"],
        `Variant name must be '${expectedName}'.`,
      );
    }

    if (seenIds.has(variant.id)) {
      addIssue(
        context,
        ["variants", variantIndex, "id"],
        `Duplicate Variant id '${variant.id}'.`,
      );
    }
    seenIds.add(variant.id);
    if (seenSlots.has(variant.slotId)) {
      addIssue(
        context,
        ["variants", variantIndex, "slotId"],
        `Duplicate Variant slot '${variant.slotId}'.`,
      );
    }
    seenSlots.add(variant.slotId);

    validateBindingTargets(
      variant.bindings,
      expectedVariantTargets(variant.selections),
      ["variants", variantIndex, "bindings"],
      context,
    );
  });

  for (const combination of expectedCombinations) {
    if (!seenCombinations.has(combination)) {
      addIssue(
        context,
        ["variants"],
        `Required Variant combination '${combination}' is missing.`,
      );
    }
  }
}

export const buttonComponentContractSchema = z
  .strictObject({
    accessibility: buttonAccessibilitySchema,
    assetId: z.literal("button"),
    assetType: z.literal(COMPONENT_ASSET_TYPE),
    assetVersion: strictSemverSchema,
    componentKind: z.literal("component-set"),
    contentDigest: contentDigestSchema.optional(),
    description: requiredText(2_000),
    layout: buttonLayoutSchema,
    name: z.literal("Button"),
    profile: z.literal(BUTTON_CONTRACT_PROFILE),
    projectId: stableIdSegmentSchema,
    properties: z.array(buttonComponentPropertySchema).min(3).max(3),
    schemaVersion: z.literal(BUTTON_CONTRACT_SCHEMA_VERSION),
    sharedBindings: z.array(buttonTokenBindingSchema).min(4).max(4),
    size: z.literal("medium"),
    tokenSource: tokenSourceSchema,
    variants: z.array(buttonVariantSchema).min(4).max(4),
  })
  .superRefine((contract, context) => {
    if (contract.tokenSource.projectId !== contract.projectId) {
      addIssue(
        context,
        ["tokenSource", "projectId"],
        "Button Contract and Token Source must belong to the same project.",
      );
    }
    validatePropertyUniqueness(contract.properties, context);
    validateFrozenButtonProperties(contract.properties, context);
    validateBindingTargets(
      contract.sharedBindings,
      new Set(SHARED_BINDING_TARGETS),
      ["sharedBindings"],
      context,
    );
    validateVariants(contract.variants, context);
  });

export type ButtonComponentContract = z.infer<
  typeof buttonComponentContractSchema
>;
export type ButtonComponentContractDigestSubject = Omit<
  ButtonComponentContract,
  "contentDigest"
>;
export type ButtonComponentContractValidationIssue = SchemaValidationIssue;

function validationFailure(
  issues: readonly SchemaValidationIssue[],
  message: string,
): FailureResult {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again.",
      target: {
        logicalId: "button",
        type: "component",
      },
    }),
  );
}

export function validateButtonComponentContract(
  input: unknown,
): ToolkitResult<ButtonComponentContract> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== BUTTON_CONTRACT_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: BUTTON_CONTRACT_SCHEMA_VERSION },
        },
        message:
          "The Button Component Contract schema version is not supported.",
        recoveryInstruction:
          "Use Button Component Contract schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "button-component-contract-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }

  const result = buttonComponentContractSchema.safeParse(input);
  if (result.success) {
    return createSuccessResult(result.data);
  }

  const issues = toValidationIssues(result.error);
  return validationFailure(
    issues,
    `The Button Component Contract contains ${String(issues.length)} validation issue(s).`,
  );
}

interface LocatedBinding {
  readonly binding: ButtonTokenBinding;
  readonly path: readonly (number | string)[];
}

function locateBindings(
  contract: ButtonComponentContract,
): readonly LocatedBinding[] {
  return [
    ...contract.sharedBindings.map((binding, index) => ({
      binding,
      path: ["sharedBindings", index, "token"] as const,
    })),
    ...contract.variants.flatMap((variant, variantIndex) =>
      variant.bindings.map((binding, bindingIndex) => ({
        binding,
        path: [
          "variants",
          variantIndex,
          "bindings",
          bindingIndex,
          "token",
        ] as const,
      })),
    ),
  ];
}

function validateTokenSource(
  contract: ButtonComponentContract,
  tokenSet: TokenSet,
): readonly SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  const comparisons = [
    ["projectId", contract.tokenSource.projectId, tokenSet.projectId],
    ["assetId", contract.tokenSource.assetId, tokenSet.assetId],
    ["assetVersion", contract.tokenSource.assetVersion, tokenSet.assetVersion],
  ] as const;

  for (const [field, actual, expected] of comparisons) {
    if (actual !== expected) {
      issues.push({
        code: "custom",
        message: `Token source ${field} '${actual}' does not match '${expected}'.`,
        path: toJsonPointer(["tokenSource", field]),
      });
    }
  }
  return issues;
}

function validateBindingsAgainstTokenSet(
  contract: ButtonComponentContract,
  tokenSet: TokenSet,
): readonly SchemaValidationIssue[] {
  const issues = [...validateTokenSource(contract, tokenSet)];
  const defaultMode = tokenSet.modes.find(
    (mode) => mode.id === tokenSet.defaultMode,
  );
  if (defaultMode === undefined) {
    issues.push({
      code: "custom",
      message: `Token Set default mode '${tokenSet.defaultMode}' does not exist.`,
      path: "/tokenSource",
    });
    return issues;
  }

  const tokenIndex = new Map(
    defaultMode.tokens.map((token) => [token.path.join("."), token]),
  );
  for (const located of locateBindings(contract)) {
    const reference = parseTokenReference(located.binding.token);
    const tokenKey = reference?.join(".");
    const token = tokenKey === undefined ? undefined : tokenIndex.get(tokenKey);
    const path = toJsonPointer(located.path);
    if (token === undefined) {
      issues.push({
        code: "custom",
        message: `Token reference '${located.binding.token}' does not exist in the declared Token Set.`,
        path,
      });
      continue;
    }

    const expectedType = BUTTON_BINDING_TARGET_TYPES[located.binding.target];
    if (token.$type !== expectedType) {
      issues.push({
        code: "custom",
        message: `Binding target '${located.binding.target}' requires '${expectedType}', but '${located.binding.token}' is '${token.$type}'.`,
        path,
      });
    }
  }
  return issues;
}

export function validateButtonComponentContractWithTokenSet(
  contractInput: unknown,
  tokenSetInput: unknown,
): ToolkitResult<ButtonComponentContract> {
  const contractResult = validateButtonComponentContract(contractInput);
  if (!contractResult.ok) {
    return contractResult;
  }

  const tokenSetResult = validateTokenSet(tokenSetInput);
  if (!tokenSetResult.ok) {
    return tokenSetResult;
  }

  const issues = validateBindingsAgainstTokenSet(
    contractResult.data,
    tokenSetResult.data,
  );
  return issues.length === 0
    ? createSuccessResult(contractResult.data)
    : validationFailure(
        issues,
        `The Button Component Contract has ${String(issues.length)} Token binding issue(s).`,
      );
}

export function toButtonComponentContractDigestSubject(
  contract: ButtonComponentContract,
): ButtonComponentContractDigestSubject {
  return {
    accessibility: contract.accessibility,
    assetId: contract.assetId,
    assetType: contract.assetType,
    assetVersion: contract.assetVersion,
    componentKind: contract.componentKind,
    description: contract.description,
    layout: contract.layout,
    name: contract.name,
    profile: contract.profile,
    projectId: contract.projectId,
    properties: contract.properties,
    schemaVersion: contract.schemaVersion,
    sharedBindings: contract.sharedBindings,
    size: contract.size,
    tokenSource: contract.tokenSource,
    variants: contract.variants,
  };
}
