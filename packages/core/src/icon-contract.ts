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

export const ICON_CONTRACT_SCHEMA_VERSION = "1.0.0" as const;
export const ICON_CONTRACT_PROFILE = "icon-v1" as const;
export const ICON_ASSET_ID = "icon/check" as const;
export const ICON_SIZES = ["small", "medium", "large"] as const;
export const ICON_BINDING_TARGETS = ["frame.size", "glyph.stroke"] as const;

export type IconBindingTarget = (typeof ICON_BINDING_TARGETS)[number];

const ICON_BINDING_TARGET_TYPES = {
  "frame.size": "dimension",
  "glyph.stroke": "color",
} as const satisfies Record<IconBindingTarget, TokenType>;

const ICON_SIZE_NAMES = {
  large: "Large",
  medium: "Medium",
  small: "Small",
} as const;

const ICON_SIZE_TOKENS = {
  large: "{semantic.dimension.icon-size-large}",
  medium: "{semantic.dimension.icon-size-medium}",
  small: "{semantic.dimension.icon-size-small}",
} as const;

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

export const iconTokenBindingSchema = z
  .strictObject({
    target: z.enum(ICON_BINDING_TARGETS),
    token: tokenReferenceSchema,
  })
  .superRefine((binding, context) => {
    if (parseTokenReference(binding.token)?.[0] !== "semantic") {
      context.addIssue({
        code: "custom",
        message: "Icon bindings must reference semantic tokens.",
        path: ["token"],
      });
    }
  });

const sizePropertySchema = z.strictObject({
  defaultOptionId: z.literal("medium"),
  description: requiredText(500),
  figmaName: z.literal("Size"),
  id: z.literal("size"),
  kind: z.literal("variant"),
  options: z
    .array(
      z.strictObject({
        description: requiredText(500),
        figmaValue: z.enum(["Small", "Medium", "Large"]),
        id: z.enum(ICON_SIZES),
      }),
    )
    .length(3),
});

export const iconVariantSchema = z.strictObject({
  bindings: z.array(iconTokenBindingSchema).length(1),
  id: stableAssetIdSchema,
  name: z.enum(["Small", "Medium", "Large"]),
  selections: z.strictObject({ size: z.enum(ICON_SIZES) }),
  slotId: stableAssetIdSchema,
});

const geometrySchema = z.strictObject({
  cap: z.literal("round"),
  join: z.literal("round"),
  opticalGrid: z.literal(24),
  pathData: z.literal("M5 12.5L10 17.5L19 7.5"),
  safeArea: z.literal(2),
  strokeWidth: z.literal(2),
});

const accessibilitySchema = z.strictObject({
  defaultPresentation: z.literal("decorative"),
  interactiveTargetOwner: z.literal("consumer"),
  minimumInteractiveTarget: z.literal(44),
  semanticUsageRequiresAccessibleName: z.literal(true),
});

type IconTokenBinding = z.infer<typeof iconTokenBindingSchema>;
type IconVariant = z.infer<typeof iconVariantSchema>;

function addIssue(
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

function validateSizeProperty(
  property: z.infer<typeof sizePropertySchema>,
  context: z.RefinementCtx,
): void {
  const ids = property.options.map(({ id }) => id);
  const names = property.options.map(({ figmaValue }) => figmaValue);
  if (new Set(ids).size !== ICON_SIZES.length) {
    addIssue(
      context,
      ["properties", 0, "options"],
      "Icon size IDs must be unique.",
    );
  }
  if (new Set(names).size !== ICON_SIZES.length) {
    addIssue(
      context,
      ["properties", 0, "options"],
      "Icon Figma size values must be unique.",
    );
  }
  for (const size of ICON_SIZES) {
    const option = property.options.find(({ id }) => id === size);
    if (option?.figmaValue !== ICON_SIZE_NAMES[size]) {
      addIssue(
        context,
        ["properties", 0, "options"],
        `Icon size '${size}' must map to '${ICON_SIZE_NAMES[size]}'.`,
      );
    }
  }
}

function validateVariants(
  variants: readonly IconVariant[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  variants.forEach((variant, index) => {
    const size = variant.selections.size;
    if (seen.has(size)) {
      addIssue(
        context,
        ["variants", index, "selections", "size"],
        `Duplicate Icon size '${size}'.`,
      );
    }
    seen.add(size);
    const expectedId = `size-${size}`;
    if (variant.id !== expectedId) {
      addIssue(
        context,
        ["variants", index, "id"],
        `Icon Variant ID must be '${expectedId}'.`,
      );
    }
    if (variant.slotId !== `variant/${expectedId}`) {
      addIssue(
        context,
        ["variants", index, "slotId"],
        `Icon Variant slotId must be 'variant/${expectedId}'.`,
      );
    }
    if (variant.name !== ICON_SIZE_NAMES[size]) {
      addIssue(
        context,
        ["variants", index, "name"],
        `Icon Variant name must be '${ICON_SIZE_NAMES[size]}'.`,
      );
    }
    const binding = variant.bindings[0];
    if (
      binding?.target !== "frame.size" ||
      binding.token !== ICON_SIZE_TOKENS[size]
    ) {
      addIssue(
        context,
        ["variants", index, "bindings"],
        `Icon size '${size}' must bind frame.size to '${ICON_SIZE_TOKENS[size]}'.`,
      );
    }
  });
  for (const size of ICON_SIZES) {
    if (!seen.has(size)) {
      addIssue(
        context,
        ["variants"],
        `Required Icon size '${size}' is missing.`,
      );
    }
  }
}

export const iconComponentContractSchema = z
  .strictObject({
    accessibility: accessibilitySchema,
    assetId: z.literal(ICON_ASSET_ID),
    assetType: z.literal(COMPONENT_ASSET_TYPE),
    assetVersion: strictSemverSchema,
    componentKind: z.literal("component-set"),
    contentDigest: contentDigestSchema.optional(),
    description: requiredText(2_000),
    geometry: geometrySchema,
    name: z.literal("Icon / Check"),
    profile: z.literal(ICON_CONTRACT_PROFILE),
    projectId: stableIdSegmentSchema,
    properties: z.array(sizePropertySchema).length(1),
    schemaVersion: z.literal(ICON_CONTRACT_SCHEMA_VERSION),
    sharedBindings: z.array(iconTokenBindingSchema).length(1),
    size: z.literal("multi-size"),
    tokenSource: tokenSourceSchema,
    variants: z.array(iconVariantSchema).length(3),
  })
  .superRefine((contract, context) => {
    if (contract.tokenSource.projectId !== contract.projectId) {
      addIssue(
        context,
        ["tokenSource", "projectId"],
        "Icon Contract and Token Source must belong to the same project.",
      );
    }
    const property = contract.properties[0];
    if (property !== undefined) validateSizeProperty(property, context);
    const shared = contract.sharedBindings[0];
    if (
      shared?.target !== "glyph.stroke" ||
      shared.token !== "{semantic.color.icon-default}"
    ) {
      addIssue(
        context,
        ["sharedBindings"],
        "Icon glyph.stroke must bind to '{semantic.color.icon-default}'.",
      );
    }
    validateVariants(contract.variants, context);
  });

export type IconComponentContract = z.infer<typeof iconComponentContractSchema>;
export type IconComponentContractDigestSubject = Omit<
  IconComponentContract,
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
      target: { logicalId: ICON_ASSET_ID, type: "component" },
    }),
  );
}

export function validateIconComponentContract(
  input: unknown,
): ToolkitResult<IconComponentContract> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== ICON_CONTRACT_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: ICON_CONTRACT_SCHEMA_VERSION },
        },
        message: "The Icon Component Contract schema version is not supported.",
        recoveryInstruction:
          "Use Icon Component Contract schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "icon-component-contract-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }
  const result = iconComponentContractSchema.safeParse(input);
  if (result.success) return createSuccessResult(result.data);
  const issues = toValidationIssues(result.error);
  return validationFailure(
    issues,
    `The Icon Component Contract contains ${String(issues.length)} validation issue(s).`,
  );
}

function locateBindings(contract: IconComponentContract): readonly {
  readonly binding: IconTokenBinding;
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
  contract: IconComponentContract,
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
    const expectedType = ICON_BINDING_TARGET_TYPES[located.binding.target];
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

export function validateIconComponentContractWithTokenSet(
  contractInput: unknown,
  tokenSetInput: unknown,
): ToolkitResult<IconComponentContract> {
  const contractResult = validateIconComponentContract(contractInput);
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
        `The Icon Component Contract has ${String(issues.length)} Token binding issue(s).`,
      );
}

export function toIconComponentContractDigestSubject(
  contract: IconComponentContract,
): IconComponentContractDigestSubject {
  const { contentDigest: _contentDigest, ...subject } = contract;
  void _contentDigest;
  return subject;
}
