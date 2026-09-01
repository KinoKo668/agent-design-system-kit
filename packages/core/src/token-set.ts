import * as z from "zod";

import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import {
  getProvidedSchemaVersion,
  toValidationIssues,
  type SchemaValidationIssue,
} from "./schema-validation.js";

export const TOKEN_SET_SCHEMA_VERSION = "1.0.0" as const;
export const TOKEN_SET_ASSET_TYPE = "token-set" as const;
export const DTCG_VERSION = "2025.10" as const;

export const TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "number",
  "typography",
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

const TOKEN_REFERENCE_PATTERN =
  /^\{([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,11})\}$/u;
const TOKEN_TIERS = ["component", "primitive", "semantic"] as const;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function requiredText(maxLength: number): z.ZodString {
  return z
    .string()
    .min(1, "Must not be empty.")
    .max(maxLength, `Must contain at most ${String(maxLength)} characters.`)
    .refine((value) => value.trim() === value, {
      message: "Must not start or end with whitespace.",
    });
}

export const tokenReferenceSchema = z
  .string()
  .regex(
    TOKEN_REFERENCE_PATTERN,
    "Must be a DTCG token reference such as {primitive.color.brand-600}.",
  );

const tokenPathSchema = z
  .array(stableIdSegmentSchema)
  .min(3, "Must include tier, category and token name segments.")
  .max(12, "Must contain at most 12 path segments.")
  .superRefine((path, context) => {
    const tier = path[0];
    if (
      tier !== undefined &&
      !TOKEN_TIERS.includes(tier as (typeof TOKEN_TIERS)[number])
    ) {
      context.addIssue({
        code: "custom",
        message: "First path segment must be primitive, semantic or component.",
        path: [0],
      });
    }
  });

const descriptionSchema = requiredText(500);
const deprecationSchema = z.union([z.boolean(), descriptionSchema]);
const unitIntervalSchema = z.number().min(0).max(1);

export const dimensionValueSchema = z.strictObject({
  unit: z.enum(["px", "rem"]),
  value: z.number(),
});

export const colorValueSchema = z
  .strictObject({
    alpha: unitIntervalSchema.optional(),
    colorSpace: z.literal("srgb"),
    components: z.tuple([
      unitIntervalSchema,
      unitIntervalSchema,
      unitIntervalSchema,
    ]),
    hex: z.string().regex(HEX_COLOR_PATTERN).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.hex !== undefined &&
      value.hex.toLowerCase() !== srgbComponentsToHex(value.components)
    ) {
      context.addIssue({
        code: "custom",
        message: "Hex fallback must represent the same sRGB components.",
        path: ["hex"],
      });
    }
  });

const fontFamilyNameSchema = requiredText(120).refine(
  (value) => !/[{}]/u.test(value),
  "Font family names must not contain alias braces.",
);

export const fontFamilyValueSchema = z.union([
  fontFamilyNameSchema,
  z.array(fontFamilyNameSchema).min(1).max(12),
]);

export const fontWeightValueSchema = z.union([
  z.number().min(1).max(1_000),
  z.enum([
    "black",
    "bold",
    "book",
    "demi-bold",
    "extra-black",
    "extra-bold",
    "extra-light",
    "hairline",
    "heavy",
    "light",
    "medium",
    "normal",
    "regular",
    "semi-bold",
    "thin",
    "ultra-black",
    "ultra-bold",
    "ultra-light",
  ]),
]);

function valueOrReference<const Schema extends z.ZodType>(
  schema: Schema,
): z.ZodUnion<readonly [z.ZodString, Schema]> {
  return z.union([tokenReferenceSchema, schema]);
}

export const typographyValueSchema = z.strictObject({
  fontFamily: valueOrReference(fontFamilyValueSchema),
  fontSize: valueOrReference(dimensionValueSchema),
  fontWeight: valueOrReference(fontWeightValueSchema),
  letterSpacing: valueOrReference(dimensionValueSchema),
  lineHeight: valueOrReference(z.number().positive()),
});

const commonTokenShape = {
  $deprecated: deprecationSchema.optional(),
  $description: descriptionSchema,
  path: tokenPathSchema,
};

const colorTokenSchema = z.strictObject({
  ...commonTokenShape,
  $type: z.literal("color"),
  $value: valueOrReference(colorValueSchema),
});

const dimensionTokenSchema = z.strictObject({
  ...commonTokenShape,
  $type: z.literal("dimension"),
  $value: valueOrReference(dimensionValueSchema),
});

const fontFamilyTokenSchema = z.strictObject({
  ...commonTokenShape,
  $type: z.literal("fontFamily"),
  $value: valueOrReference(fontFamilyValueSchema),
});

const fontWeightTokenSchema = z.strictObject({
  ...commonTokenShape,
  $type: z.literal("fontWeight"),
  $value: valueOrReference(fontWeightValueSchema),
});

const numberTokenSchema = z.strictObject({
  ...commonTokenShape,
  $type: z.literal("number"),
  $value: valueOrReference(z.number()),
});

const typographyTokenSchema = z.strictObject({
  ...commonTokenShape,
  $type: z.literal("typography"),
  $value: valueOrReference(typographyValueSchema),
});

export const tokenDefinitionSchema = z.discriminatedUnion("$type", [
  colorTokenSchema,
  dimensionTokenSchema,
  fontFamilyTokenSchema,
  fontWeightTokenSchema,
  numberTokenSchema,
  typographyTokenSchema,
]);

const tokenModeSchema = z.strictObject({
  id: stableIdSegmentSchema,
  name: requiredText(120),
  tokens: z.array(tokenDefinitionSchema).min(1).max(2_000),
});

interface TokenDependency {
  readonly expectedType: TokenType;
  readonly reference: string;
  readonly tokenIndex: number;
  readonly valuePath: readonly (number | string)[];
}

type TokenDefinition = z.infer<typeof tokenDefinitionSchema>;
type TokenMode = z.infer<typeof tokenModeSchema>;

function tokenPathToKey(path: readonly string[]): string {
  return path.join(".");
}

export function parseTokenReference(
  reference: string,
): readonly string[] | undefined {
  const match = TOKEN_REFERENCE_PATTERN.exec(reference);
  return match?.[1]?.split(".");
}

export function srgbComponentsToHex(
  components: readonly [number, number, number],
): string {
  const channelToHex = (channel: number): string =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${components.map(channelToHex).join("")}`;
}

function getTokenDependencies(
  token: TokenDefinition,
  tokenIndex: number,
): readonly TokenDependency[] {
  if (typeof token.$value === "string") {
    const reference = parseTokenReference(token.$value);
    return reference === undefined
      ? []
      : [
          {
            expectedType: token.$type,
            reference: token.$value,
            tokenIndex,
            valuePath: ["$value"],
          },
        ];
  }

  if (token.$type !== "typography") {
    return [];
  }

  const propertyTypes = {
    fontFamily: "fontFamily",
    fontSize: "dimension",
    fontWeight: "fontWeight",
    letterSpacing: "dimension",
    lineHeight: "number",
  } as const satisfies Record<keyof typeof token.$value, TokenType>;

  const dependencies: TokenDependency[] = [];
  for (const property of Object.keys(propertyTypes) as Array<
    keyof typeof propertyTypes
  >) {
    const value = token.$value[property];
    if (typeof value !== "string" || parseTokenReference(value) === undefined) {
      continue;
    }

    dependencies.push({
      expectedType: propertyTypes[property],
      reference: value,
      tokenIndex,
      valuePath: ["$value", property],
    });
  }

  return dependencies;
}

function indexModeTokens(
  mode: TokenMode,
  modeIndex: number,
  context: z.RefinementCtx,
): ReadonlyMap<
  string,
  { readonly index: number; readonly token: TokenDefinition }
> {
  const index = new Map<
    string,
    { readonly index: number; readonly token: TokenDefinition }
  >();

  mode.tokens.forEach((token, tokenIndex) => {
    const key = tokenPathToKey(token.path);
    if (index.has(key)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate token path '${key}' in mode '${mode.id}'.`,
        path: ["modes", modeIndex, "tokens", tokenIndex, "path"],
      });
      return;
    }
    index.set(key, { index: tokenIndex, token });
  });

  return index;
}

function validateModeParity(
  modes: readonly TokenMode[],
  defaultMode: string,
  indexes: readonly ReadonlyMap<
    string,
    { readonly index: number; readonly token: TokenDefinition }
  >[],
  context: z.RefinementCtx,
): void {
  const defaultModeIndex = modes.findIndex((mode) => mode.id === defaultMode);
  const baselineIndex = indexes[defaultModeIndex === -1 ? 0 : defaultModeIndex];
  if (baselineIndex === undefined) {
    return;
  }

  modes.forEach((mode, modeIndex) => {
    const modeIndexMap = indexes[modeIndex];
    if (modeIndexMap === undefined || modeIndexMap === baselineIndex) {
      return;
    }

    for (const [key, baselineEntry] of baselineIndex) {
      const entry = modeIndexMap.get(key);
      if (entry === undefined) {
        context.addIssue({
          code: "custom",
          message: `Mode '${mode.id}' is missing token '${key}'.`,
          path: ["modes", modeIndex, "tokens"],
        });
        continue;
      }

      if (entry.token.$type !== baselineEntry.token.$type) {
        context.addIssue({
          code: "custom",
          message: `Token '${key}' must keep type '${baselineEntry.token.$type}' in every mode.`,
          path: ["modes", modeIndex, "tokens", entry.index, "$type"],
        });
      }

      if (entry.token.$description !== baselineEntry.token.$description) {
        context.addIssue({
          code: "custom",
          message: `Token '${key}' must keep the same description in every mode.`,
          path: ["modes", modeIndex, "tokens", entry.index, "$description"],
        });
      }

      if (entry.token.$deprecated !== baselineEntry.token.$deprecated) {
        context.addIssue({
          code: "custom",
          message: `Token '${key}' must keep the same deprecation state in every mode.`,
          path: ["modes", modeIndex, "tokens", entry.index, "$deprecated"],
        });
      }
    }

    for (const [key, entry] of modeIndexMap) {
      if (!baselineIndex.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Mode '${mode.id}' has unexpected token '${key}'.`,
          path: ["modes", modeIndex, "tokens", entry.index, "path"],
        });
      }
    }
  });
}

function validateModeReferences(
  mode: TokenMode,
  modeIndex: number,
  tokenIndex: ReadonlyMap<
    string,
    { readonly index: number; readonly token: TokenDefinition }
  >,
  context: z.RefinementCtx,
): void {
  const dependenciesByToken = new Map<string, readonly TokenDependency[]>();

  for (const [key, entry] of tokenIndex) {
    const dependencies = getTokenDependencies(entry.token, entry.index);
    dependenciesByToken.set(key, dependencies);
    const sourceTier = entry.token.path[0];

    if (sourceTier === "primitive" && dependencies.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Primitive tokens must contain direct values, not aliases.",
        path: ["modes", modeIndex, "tokens", entry.index, "$value"],
      });
    }

    if (
      (sourceTier === "semantic" || sourceTier === "component") &&
      dependencies.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: `${sourceTier} tokens must derive from approved aliases, not raw values.`,
        path: ["modes", modeIndex, "tokens", entry.index, "$value"],
      });
    }

    for (const dependency of dependencies) {
      const targetPath = parseTokenReference(dependency.reference);
      const targetKey = targetPath?.join(".");
      const target =
        targetKey === undefined ? undefined : tokenIndex.get(targetKey);
      const issuePath = [
        "modes",
        modeIndex,
        "tokens",
        dependency.tokenIndex,
        ...dependency.valuePath,
      ];

      if (target === undefined) {
        context.addIssue({
          code: "custom",
          message: `Unresolved token reference '${dependency.reference}'.`,
          path: issuePath,
        });
        continue;
      }

      if (target.token.$type !== dependency.expectedType) {
        context.addIssue({
          code: "custom",
          message: `Reference '${dependency.reference}' has type '${target.token.$type}', expected '${dependency.expectedType}'.`,
          path: issuePath,
        });
      }

      const targetTier = target.token.path[0];
      if (sourceTier === "semantic" && targetTier === "component") {
        context.addIssue({
          code: "custom",
          message: "Semantic tokens must not depend on component tokens.",
          path: issuePath,
        });
      }
      if (sourceTier === "component" && targetTier === "primitive") {
        context.addIssue({
          code: "custom",
          message: "Component tokens must reference semantic tokens.",
          path: issuePath,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reportedEdges = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    visiting.add(key);

    for (const dependency of dependenciesByToken.get(key) ?? []) {
      const targetKey = parseTokenReference(dependency.reference)?.join(".");
      if (targetKey === undefined || !tokenIndex.has(targetKey)) {
        continue;
      }

      if (visiting.has(targetKey)) {
        const edge = `${key}->${targetKey}`;
        if (!reportedEdges.has(edge)) {
          context.addIssue({
            code: "custom",
            message: `Circular token reference detected from '${key}' to '${targetKey}'.`,
            path: [
              "modes",
              modeIndex,
              "tokens",
              dependency.tokenIndex,
              ...dependency.valuePath,
            ],
          });
          reportedEdges.add(edge);
        }
        continue;
      }

      visit(targetKey);
    }

    visiting.delete(key);
    visited.add(key);
  };

  for (const key of tokenIndex.keys()) {
    visit(key);
  }
}

export const tokenSetSchema = z
  .strictObject({
    assetId: stableAssetIdSchema,
    assetType: z.literal(TOKEN_SET_ASSET_TYPE),
    assetVersion: strictSemverSchema,
    contentDigest: contentDigestSchema.optional(),
    defaultMode: stableIdSegmentSchema,
    description: requiredText(2_000),
    dtcgVersion: z.literal(DTCG_VERSION),
    modes: z.array(tokenModeSchema).min(1).max(8),
    name: requiredText(120),
    projectId: stableIdSegmentSchema,
    schemaVersion: z.literal(TOKEN_SET_SCHEMA_VERSION),
  })
  .superRefine((tokenSet, context) => {
    const seenModes = new Set<string>();
    tokenSet.modes.forEach((mode, modeIndex) => {
      if (seenModes.has(mode.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate mode id '${mode.id}'.`,
          path: ["modes", modeIndex, "id"],
        });
      }
      seenModes.add(mode.id);
    });

    if (!seenModes.has(tokenSet.defaultMode)) {
      context.addIssue({
        code: "custom",
        message: `Default mode '${tokenSet.defaultMode}' does not exist.`,
        path: ["defaultMode"],
      });
    }

    const indexes = tokenSet.modes.map((mode, modeIndex) =>
      indexModeTokens(mode, modeIndex, context),
    );
    validateModeParity(tokenSet.modes, tokenSet.defaultMode, indexes, context);

    tokenSet.modes.forEach((mode, modeIndex) => {
      const index = indexes[modeIndex];
      if (index !== undefined) {
        validateModeReferences(mode, modeIndex, index, context);
      }
    });
  });

export type TokenSet = z.infer<typeof tokenSetSchema>;
export type TokenSetDigestSubject = Omit<TokenSet, "contentDigest">;
export type TokenSetValidationIssue = SchemaValidationIssue;

export function validateTokenSet(input: unknown): ToolkitResult<TokenSet> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== TOKEN_SET_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: TOKEN_SET_SCHEMA_VERSION },
        },
        message: "The Token Set schema version is not supported.",
        recoveryInstruction:
          "Use Token Set schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "token-set-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }

  const result = tokenSetSchema.safeParse(input);
  if (result.success) {
    return createSuccessResult(result.data);
  }

  const issues = toValidationIssues(result.error);
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The Token Set contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again.",
      target: {
        logicalId: "token-set",
        type: "token-set",
      },
    }),
  );
}

export function toTokenSetDigestSubject(
  tokenSet: TokenSet,
): TokenSetDigestSubject {
  return {
    assetId: tokenSet.assetId,
    assetType: tokenSet.assetType,
    assetVersion: tokenSet.assetVersion,
    defaultMode: tokenSet.defaultMode,
    description: tokenSet.description,
    dtcgVersion: tokenSet.dtcgVersion,
    modes: tokenSet.modes,
    name: tokenSet.name,
    projectId: tokenSet.projectId,
    schemaVersion: tokenSet.schemaVersion,
  };
}
