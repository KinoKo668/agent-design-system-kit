import * as z from "zod";

import { COMPONENT_ASSET_TYPE } from "./button-contract.js";
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

export const INPUT_CONTRACT_SCHEMA_VERSION = "1.0.0" as const;
export const INPUT_CONTRACT_PROFILE = "input-v1" as const;
export const INPUT_ASSET_ID = "input/text" as const;
export const INPUT_STATES = [
  "default",
  "focused",
  "error",
  "disabled",
] as const;
export const INPUT_CONTENTS = ["empty", "filled"] as const;

export const INPUT_SHARED_BINDING_TARGETS = [
  "field.background",
  "field.radius",
  "field.height",
  "field.padding-inline",
  "layout.gap",
  "label.fill",
  "label.typography",
  "value.typography",
  "support.typography",
] as const;
export const INPUT_VARIANT_BINDING_TARGETS = [
  "field.border",
  "field.border-width",
  "value.fill",
  "support.fill",
] as const;
export const INPUT_BINDING_TARGETS = [
  ...INPUT_SHARED_BINDING_TARGETS,
  ...INPUT_VARIANT_BINDING_TARGETS,
] as const;

export type InputBindingTarget = (typeof INPUT_BINDING_TARGETS)[number];
export type InputState = (typeof INPUT_STATES)[number];
export type InputContent = (typeof INPUT_CONTENTS)[number];

const INPUT_BINDING_TARGET_TYPES = {
  "field.background": "color",
  "field.border": "color",
  "field.border-width": "dimension",
  "field.height": "dimension",
  "field.padding-inline": "dimension",
  "field.radius": "dimension",
  "label.fill": "color",
  "label.typography": "typography",
  "layout.gap": "dimension",
  "support.fill": "color",
  "support.typography": "typography",
  "value.fill": "color",
  "value.typography": "typography",
} as const satisfies Record<InputBindingTarget, TokenType>;

const INPUT_STATE_NAMES = {
  default: "Default",
  disabled: "Disabled",
  error: "Error",
  focused: "Focused",
} as const;
const INPUT_CONTENT_NAMES = { empty: "Empty", filled: "Filled" } as const;

function requiredText(maxLength: number): z.ZodString {
  return z
    .string()
    .min(1, "Must not be empty.")
    .max(maxLength, `Must contain at most ${String(maxLength)} characters.`)
    .refine((value) => value.trim() === value, {
      message: "Must not start or end with whitespace.",
    });
}

const tokenSourceSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetType: z.literal(TOKEN_SET_ASSET_TYPE),
  assetVersion: strictSemverSchema,
  projectId: stableIdSegmentSchema,
});

export const inputTokenBindingSchema = z
  .strictObject({
    target: z.enum(INPUT_BINDING_TARGETS),
    token: tokenReferenceSchema,
  })
  .superRefine((binding, context) => {
    if (parseTokenReference(binding.token)?.[0] !== "semantic") {
      context.addIssue({
        code: "custom",
        message: "Input bindings must reference semantic tokens.",
        path: ["token"],
      });
    }
  });

const statePropertySchema = z.strictObject({
  defaultOptionId: z.literal("default"),
  description: requiredText(500),
  figmaName: z.literal("State"),
  id: z.literal("state"),
  kind: z.literal("variant"),
  options: z
    .array(
      z.strictObject({
        description: requiredText(500),
        figmaValue: z.enum(["Default", "Focused", "Error", "Disabled"]),
        id: z.enum(INPUT_STATES),
      }),
    )
    .length(4),
});

const contentPropertySchema = z.strictObject({
  defaultOptionId: z.literal("empty"),
  description: requiredText(500),
  figmaName: z.literal("Content"),
  id: z.literal("content"),
  kind: z.literal("variant"),
  options: z
    .array(
      z.strictObject({
        description: requiredText(500),
        figmaValue: z.enum(["Empty", "Filled"]),
        id: z.enum(INPUT_CONTENTS),
      }),
    )
    .length(2),
});

const textPropertySchema = z.strictObject({
  defaultValue: requiredText(500),
  description: requiredText(500),
  figmaName: z.enum(["Label", "Text", "Supporting text"]),
  id: z.enum(["label", "text", "supporting-text"]),
  kind: z.literal("text"),
});

export const inputComponentPropertySchema = z.union([
  statePropertySchema,
  contentPropertySchema,
  textPropertySchema,
]);

export const inputVariantSchema = z.strictObject({
  bindings: z.array(inputTokenBindingSchema).length(4),
  id: stableAssetIdSchema,
  name: requiredText(120),
  selections: z.strictObject({
    content: z.enum(INPUT_CONTENTS),
    state: z.enum(INPUT_STATES),
  }),
  slotId: stableAssetIdSchema,
  textDefaults: z.strictObject({
    supportingText: requiredText(500),
    text: requiredText(500),
  }),
});

const inputLayoutSchema = z.strictObject({
  fieldHeight: z.literal(48),
  gap: z.literal(6),
  paddingInline: z.literal(12),
  width: z.literal(320),
});

const inputAccessibilitySchema = z.strictObject({
  disabledStateRequired: z.literal(true),
  errorMessageNearField: z.literal(true),
  errorNotColorOnly: z.literal(true),
  focusIndicatorRequired: z.literal(true),
  minimumInteractiveTarget: z.literal(44),
  minimumTextContrast: z.literal(4.5),
  placeholderAsOnlyLabelAllowed: z.literal(false),
  visibleLabelRequired: z.literal(true),
});

type InputTokenBinding = z.infer<typeof inputTokenBindingSchema>;
type InputVariant = z.infer<typeof inputVariantSchema>;

function addIssue(
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

function validatePropertyOptions(
  property: z.infer<typeof statePropertySchema | typeof contentPropertySchema>,
  expected: Readonly<Record<string, string>>,
  index: number,
  context: z.RefinementCtx,
): void {
  const ids = property.options.map(({ id }) => id);
  const names = property.options.map(({ figmaValue }) => figmaValue);
  if (new Set(ids).size !== Object.keys(expected).length) {
    addIssue(
      context,
      ["properties", index, "options"],
      "Option IDs must be unique.",
    );
  }
  if (new Set(names).size !== Object.keys(expected).length) {
    addIssue(
      context,
      ["properties", index, "options"],
      "Figma option names must be unique.",
    );
  }
  for (const [id, name] of Object.entries(expected)) {
    if (
      property.options.find((option) => option.id === id)?.figmaValue !== name
    ) {
      addIssue(
        context,
        ["properties", index, "options"],
        `Option '${id}' must map to '${name}'.`,
      );
    }
  }
}

function expectedVariantTokens(
  state: InputState,
  content: InputContent,
): Readonly<Record<(typeof INPUT_VARIANT_BINDING_TARGETS)[number], string>> {
  return {
    "field.border": `{semantic.color.input-border-${state}}`,
    "field.border-width":
      state === "focused"
        ? "{semantic.dimension.input-border-width-focused}"
        : "{semantic.dimension.input-border-width-default}",
    "support.fill":
      state === "error"
        ? "{semantic.color.input-error}"
        : state === "disabled"
          ? "{semantic.color.input-disabled}"
          : "{semantic.color.input-helper}",
    "value.fill":
      state === "disabled"
        ? "{semantic.color.input-disabled}"
        : content === "empty"
          ? "{semantic.color.input-placeholder}"
          : "{semantic.color.input-value}",
  };
}

function validateVariants(
  variants: readonly InputVariant[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  variants.forEach((variant, index) => {
    const { content, state } = variant.selections;
    const key = `${state}/${content}`;
    if (seen.has(key)) {
      addIssue(
        context,
        ["variants", index, "selections"],
        `Duplicate Input Variant '${key}'.`,
      );
    }
    seen.add(key);
    const expectedId = `state-${state}/content-${content}`;
    if (variant.id !== expectedId) {
      addIssue(
        context,
        ["variants", index, "id"],
        `Input Variant ID must be '${expectedId}'.`,
      );
    }
    if (variant.slotId !== `variant/${expectedId}`) {
      addIssue(
        context,
        ["variants", index, "slotId"],
        `Input Variant slotId must be 'variant/${expectedId}'.`,
      );
    }
    const expectedName = `${INPUT_STATE_NAMES[state]} / ${INPUT_CONTENT_NAMES[content]}`;
    if (variant.name !== expectedName) {
      addIssue(
        context,
        ["variants", index, "name"],
        `Input Variant name must be '${expectedName}'.`,
      );
    }
    const expected = expectedVariantTokens(state, content);
    const actual = new Map(
      variant.bindings.map((binding) => [binding.target, binding.token]),
    );
    for (const target of INPUT_VARIANT_BINDING_TARGETS) {
      if (actual.get(target) !== expected[target]) {
        addIssue(
          context,
          ["variants", index, "bindings"],
          `Input Variant '${key}' must bind '${target}' to '${expected[target]}'.`,
        );
      }
    }
  });
  for (const state of INPUT_STATES) {
    for (const content of INPUT_CONTENTS) {
      if (!seen.has(`${state}/${content}`)) {
        addIssue(
          context,
          ["variants"],
          `Required Input Variant '${state}/${content}' is missing.`,
        );
      }
    }
  }
}

const EXPECTED_SHARED_BINDINGS = {
  "field.background": "{semantic.color.input-background}",
  "field.height": "{semantic.dimension.input-height}",
  "field.padding-inline": "{semantic.dimension.input-padding-inline}",
  "field.radius": "{semantic.dimension.input-radius}",
  "label.fill": "{semantic.color.input-label}",
  "label.typography": "{semantic.typography.input-label}",
  "layout.gap": "{semantic.dimension.input-gap}",
  "support.typography": "{semantic.typography.input-support}",
  "value.typography": "{semantic.typography.input-value}",
} as const satisfies Readonly<
  Record<(typeof INPUT_SHARED_BINDING_TARGETS)[number], string>
>;

export const inputComponentContractSchema = z
  .strictObject({
    accessibility: inputAccessibilitySchema,
    assetId: z.literal(INPUT_ASSET_ID),
    assetType: z.literal(COMPONENT_ASSET_TYPE),
    assetVersion: strictSemverSchema,
    componentKind: z.literal("component-set"),
    contentDigest: contentDigestSchema.optional(),
    description: requiredText(2_000),
    layout: inputLayoutSchema,
    name: z.literal("Input / Text"),
    profile: z.literal(INPUT_CONTRACT_PROFILE),
    projectId: stableIdSegmentSchema,
    properties: z.array(inputComponentPropertySchema).length(5),
    schemaVersion: z.literal(INPUT_CONTRACT_SCHEMA_VERSION),
    sharedBindings: z.array(inputTokenBindingSchema).length(9),
    size: z.literal("medium"),
    tokenSource: tokenSourceSchema,
    variants: z.array(inputVariantSchema).length(8),
  })
  .superRefine((contract, context) => {
    if (contract.tokenSource.projectId !== contract.projectId) {
      addIssue(
        context,
        ["tokenSource", "projectId"],
        "Input Contract and Token Source must belong to the same project.",
      );
    }
    const ids = contract.properties.map(({ id }) => id);
    if (new Set(ids).size !== 5) {
      addIssue(context, ["properties"], "Input property IDs must be unique.");
    }
    const state = contract.properties.find(
      (property): property is z.infer<typeof statePropertySchema> =>
        property.kind === "variant" && property.id === "state",
    );
    const content = contract.properties.find(
      (property): property is z.infer<typeof contentPropertySchema> =>
        property.kind === "variant" && property.id === "content",
    );
    if (state === undefined || content === undefined) {
      addIssue(
        context,
        ["properties"],
        "Input must define State and Content Variant properties.",
      );
    } else {
      validatePropertyOptions(state, INPUT_STATE_NAMES, 0, context);
      validatePropertyOptions(content, INPUT_CONTENT_NAMES, 1, context);
    }
    for (const [id, figmaName] of [
      ["label", "Label"],
      ["text", "Text"],
      ["supporting-text", "Supporting text"],
    ] as const) {
      const property = contract.properties.find(
        (candidate) => candidate.kind === "text" && candidate.id === id,
      );
      if (property?.figmaName !== figmaName) {
        addIssue(
          context,
          ["properties"],
          `Input must define text property '${id}' as '${figmaName}'.`,
        );
      }
    }
    const shared = new Map(
      contract.sharedBindings.map((binding) => [binding.target, binding.token]),
    );
    for (const target of INPUT_SHARED_BINDING_TARGETS) {
      if (shared.get(target) !== EXPECTED_SHARED_BINDINGS[target]) {
        addIssue(
          context,
          ["sharedBindings"],
          `Input must bind '${target}' to '${EXPECTED_SHARED_BINDINGS[target]}'.`,
        );
      }
    }
    validateVariants(contract.variants, context);
  });

export type InputComponentContract = z.infer<
  typeof inputComponentContractSchema
>;
export type InputComponentContractDigestSubject = Omit<
  InputComponentContract,
  "contentDigest"
>;

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
      target: { logicalId: INPUT_ASSET_ID, type: "component" },
    }),
  );
}

export function validateInputComponentContract(
  input: unknown,
): ToolkitResult<InputComponentContract> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== INPUT_CONTRACT_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: INPUT_CONTRACT_SCHEMA_VERSION },
        },
        message:
          "The Input Component Contract schema version is not supported.",
        recoveryInstruction:
          "Use Input Component Contract schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "input-component-contract-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }
  const result = inputComponentContractSchema.safeParse(input);
  if (result.success) return createSuccessResult(result.data);
  const issues = toValidationIssues(result.error);
  return validationFailure(
    issues,
    `The Input Component Contract contains ${String(issues.length)} validation issue(s).`,
  );
}

function locateBindings(contract: InputComponentContract): readonly {
  readonly binding: InputTokenBinding;
  readonly path: readonly PropertyKey[];
}[] {
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

function validateBindingsAgainstTokenSet(
  contract: InputComponentContract,
  tokenSet: TokenSet,
): readonly SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  for (const [field, actual, expected] of [
    ["projectId", contract.tokenSource.projectId, tokenSet.projectId],
    ["assetId", contract.tokenSource.assetId, tokenSet.assetId],
    ["assetVersion", contract.tokenSource.assetVersion, tokenSet.assetVersion],
  ] as const) {
    if (actual !== expected) {
      issues.push({
        code: "custom",
        message: `Token source ${field} '${actual}' does not match '${expected}'.`,
        path: toJsonPointer(["tokenSource", field]),
      });
    }
  }
  const defaultMode = tokenSet.modes.find(
    ({ id }) => id === tokenSet.defaultMode,
  );
  if (defaultMode === undefined) return issues;
  const tokens = new Map(
    defaultMode.tokens.map((token) => [token.path.join("."), token]),
  );
  for (const located of locateBindings(contract)) {
    const key = parseTokenReference(located.binding.token)?.join(".");
    const token = key === undefined ? undefined : tokens.get(key);
    const path = toJsonPointer(located.path);
    if (token === undefined) {
      issues.push({
        code: "custom",
        message: `Token reference '${located.binding.token}' does not exist in the declared Token Set.`,
        path,
      });
      continue;
    }
    const expectedType = INPUT_BINDING_TARGET_TYPES[located.binding.target];
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

export function validateInputComponentContractWithTokenSet(
  contractInput: unknown,
  tokenSetInput: unknown,
): ToolkitResult<InputComponentContract> {
  const contractResult = validateInputComponentContract(contractInput);
  if (!contractResult.ok) return contractResult;
  const tokenSetResult = validateTokenSet(tokenSetInput);
  if (!tokenSetResult.ok) return tokenSetResult;
  const issues = validateBindingsAgainstTokenSet(
    contractResult.data,
    tokenSetResult.data,
  );
  return issues.length === 0
    ? createSuccessResult(contractResult.data)
    : validationFailure(
        issues,
        `The Input Component Contract has ${String(issues.length)} Token binding issue(s).`,
      );
}

export function toInputComponentContractDigestSubject(
  contract: InputComponentContract,
): InputComponentContractDigestSubject {
  const { contentDigest: _contentDigest, ...subject } = contract;
  void _contentDigest;
  return subject;
}
