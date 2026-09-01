import * as z from "zod";

import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ResultWarning, ToolkitResult } from "./results.js";
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
  type TokenType,
} from "./token-set.js";

export const FIGMA_VARIABLE_PLAN_SCHEMA_VERSION = "1.0.0" as const;

export const FIGMA_VARIABLE_RESOLVED_TYPES = [
  "COLOR",
  "FLOAT",
  "STRING",
] as const;
export type FigmaVariableResolvedType =
  (typeof FIGMA_VARIABLE_RESOLVED_TYPES)[number];

export const FIGMA_VARIABLE_SCOPES = [
  "CORNER_RADIUS",
  "FONT_FAMILY",
  "FONT_SIZE",
  "FONT_WEIGHT",
  "FRAME_FILL",
  "GAP",
  "LETTER_SPACING",
  "LINE_HEIGHT",
  "OPACITY",
  "SHAPE_FILL",
  "STROKE_COLOR",
  "STROKE_FLOAT",
  "TEXT_FILL",
  "WIDTH_HEIGHT",
] as const;
export type FigmaVariableScope = (typeof FIGMA_VARIABLE_SCOPES)[number];

const boundedText = (maximum: number): z.ZodString =>
  z.string().min(1).max(maximum);

const colorValueSchema = z
  .object({
    a: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    kind: z.literal("color"),
    r: z.number().min(0).max(1),
  })
  .strict();
const floatValueSchema = z
  .object({ kind: z.literal("float"), value: z.number() })
  .strict();
const stringValueSchema = z
  .object({ kind: z.literal("string"), value: boundedText(500) })
  .strict();
const aliasValueSchema = z
  .object({ kind: z.literal("alias"), targetStableId: stableAssetIdSchema })
  .strict();

export const figmaVariablePlannedValueSchema = z.discriminatedUnion("kind", [
  aliasValueSchema,
  colorValueSchema,
  floatValueSchema,
  stringValueSchema,
]);
export type FigmaVariablePlannedValue = z.infer<
  typeof figmaVariablePlannedValueSchema
>;

export const figmaVariablePlanSchema = z
  .object({
    collection: z
      .object({
        defaultModeId: stableAssetIdSchema,
        description: boundedText(500),
        majorVersion: z.number().int().nonnegative(),
        modes: z
          .array(
            z
              .object({
                name: boundedText(120),
                stableId: stableAssetIdSchema,
              })
              .strict(),
          )
          .min(1)
          .max(8),
        name: boundedText(120),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    deferredTypography: z.array(
      z
        .object({
          description: boundedText(500),
          stableId: stableAssetIdSchema,
          tokenPath: stableAssetIdSchema,
        })
        .strict(),
    ),
    schemaVersion: z.literal(FIGMA_VARIABLE_PLAN_SCHEMA_VERSION),
    source: z
      .object({
        assetId: stableAssetIdSchema,
        assetVersion: strictSemverSchema,
        contentDigest: contentDigestSchema,
        projectId: stableIdSegmentSchema,
      })
      .strict(),
    variables: z
      .array(
        z
          .object({
            codeSyntax: boundedText(500),
            description: boundedText(500),
            hiddenFromPublishing: z.boolean(),
            name: boundedText(500),
            resolvedType: z.enum(FIGMA_VARIABLE_RESOLVED_TYPES),
            scopes: z.array(z.enum(FIGMA_VARIABLE_SCOPES)),
            stableId: stableAssetIdSchema,
            tokenPath: stableAssetIdSchema,
            tokenType: z.enum([
              "color",
              "dimension",
              "fontFamily",
              "fontWeight",
              "number",
            ]),
            values: z
              .array(
                z
                  .object({
                    modeStableId: stableAssetIdSchema,
                    value: figmaVariablePlannedValueSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(8),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .strict()
  .superRefine((plan, context) => {
    const expectedCollectionId = `${plan.source.projectId}/token-set/${plan.source.assetId}/variables/major-${String(plan.collection.majorVersion)}`;
    if (plan.collection.stableId !== expectedCollectionId) {
      context.addIssue({
        code: "custom",
        message: "Collection identity does not match the Token source.",
        path: ["collection", "stableId"],
      });
    }
    if (
      majorVersion(plan.source.assetVersion) !== plan.collection.majorVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Collection Major version does not match the Token version.",
        path: ["collection", "majorVersion"],
      });
    }

    const modeIds = new Set<string>();
    const modeNames = new Set<string>();
    plan.collection.modes.forEach((mode, index) => {
      if (modeIds.has(mode.stableId)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate stable Mode identity.",
          path: ["collection", "modes", index, "stableId"],
        });
      }
      if (modeNames.has(mode.name)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate Figma Mode name.",
          path: ["collection", "modes", index, "name"],
        });
      }
      if (!mode.stableId.startsWith(`${plan.collection.stableId}/mode/`)) {
        context.addIssue({
          code: "custom",
          message: "Mode identity must belong to the planned Collection.",
          path: ["collection", "modes", index, "stableId"],
        });
      }
      modeIds.add(mode.stableId);
      modeNames.add(mode.name);
    });
    if (!modeIds.has(plan.collection.defaultModeId)) {
      context.addIssue({
        code: "custom",
        message: "Default Mode identity must exist in modes.",
        path: ["collection", "defaultModeId"],
      });
    }

    const variablesById = new Map(
      plan.variables.map((variable) => [variable.stableId, variable]),
    );
    const stableIds = new Set<string>();
    const names = new Set<string>();
    const paths = new Set<string>();
    plan.variables.forEach((variable, index) => {
      const duplicateFields = [
        stableIds.has(variable.stableId) ? "stableId" : null,
        names.has(variable.name) ? "name" : null,
        paths.has(variable.tokenPath) ? "tokenPath" : null,
      ].filter((field): field is string => field !== null);
      duplicateFields.forEach((field) => {
        context.addIssue({
          code: "custom",
          message: `Duplicate Variable ${field}.`,
          path: ["variables", index, field],
        });
      });
      stableIds.add(variable.stableId);
      names.add(variable.name);
      paths.add(variable.tokenPath);
      if (
        variable.stableId !==
        `${plan.collection.stableId}/variable/${variable.tokenPath}`
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Variable identity must derive from its Collection and Token path.",
          path: ["variables", index, "stableId"],
        });
      }
      if (variable.name !== variable.tokenPath) {
        context.addIssue({
          code: "custom",
          message: "Variable name must equal its stable Token path.",
          path: ["variables", index, "name"],
        });
      }
      const tier = variable.tokenPath.split("/")[0];
      if (tier === "primitive") {
        if (!variable.hiddenFromPublishing || variable.scopes.length > 0) {
          context.addIssue({
            code: "custom",
            message:
              "Primitive Variables must be hidden and have no picker scopes.",
            path: ["variables", index, "scopes"],
          });
        }
      } else if (
        (tier === "semantic" || tier === "component") &&
        (variable.hiddenFromPublishing || variable.scopes.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Semantic and Component Variables need explicit picker scopes.",
          path: ["variables", index, "scopes"],
        });
      }
      if (new Set(variable.scopes).size !== variable.scopes.length) {
        context.addIssue({
          code: "custom",
          message: "Variable scopes must be unique.",
          path: ["variables", index, "scopes"],
        });
      }
      const valueModes = new Set(
        variable.values.map(({ modeStableId }) => modeStableId),
      );
      if (
        valueModes.size !== modeIds.size ||
        [...modeIds].some((modeId) => !valueModes.has(modeId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Every Variable must define exactly one value for every Mode.",
          path: ["variables", index, "values"],
        });
      }
    });

    plan.variables.forEach((variable, variableIndex) => {
      variable.values.forEach((entry, valueIndex) => {
        const value = entry.value;
        if (value.kind === "alias") {
          const target = variablesById.get(value.targetStableId);
          if (target === undefined) {
            context.addIssue({
              code: "custom",
              message: "Variable alias target is not present in this plan.",
              path: ["variables", variableIndex, "values", valueIndex, "value"],
            });
          } else if (target.resolvedType !== variable.resolvedType) {
            context.addIssue({
              code: "custom",
              message: "Variable alias target has a different resolved type.",
              path: ["variables", variableIndex, "values", valueIndex, "value"],
            });
          }
          return;
        }
        const expectedKind =
          variable.resolvedType === "COLOR"
            ? "color"
            : variable.resolvedType === "FLOAT"
              ? "float"
              : "string";
        if (value.kind !== expectedKind) {
          context.addIssue({
            code: "custom",
            message: "Direct Variable value does not match its resolved type.",
            path: ["variables", variableIndex, "values", valueIndex, "value"],
          });
        }
      });
    });
  });

export type FigmaVariablePlan = z.infer<typeof figmaVariablePlanSchema>;
type VariableSpec = FigmaVariablePlan["variables"][number];
type TokenDefinition = TokenSet["modes"][number]["tokens"][number];

function majorVersion(version: string): number {
  return Number(version.split(".")[0]);
}

function collectionName(tokenSet: TokenSet): string {
  const suffix = ` / v${String(majorVersion(tokenSet.assetVersion))}`;
  return `${tokenSet.name.slice(0, 120 - suffix.length).trimEnd()}${suffix}`;
}

function tokenPath(token: TokenDefinition): string {
  return token.path.join("/");
}

function collectionStableId(tokenSet: TokenSet): string {
  return `${tokenSet.projectId}/token-set/${tokenSet.assetId}/variables/major-${String(majorVersion(tokenSet.assetVersion))}`;
}

function variableStableId(tokenSet: TokenSet, token: TokenDefinition): string {
  return `${collectionStableId(tokenSet)}/variable/${tokenPath(token)}`;
}

function modeStableId(tokenSet: TokenSet, modeId: string): string {
  return `${collectionStableId(tokenSet)}/mode/${modeId}`;
}

function cssCustomProperty(tokenSet: TokenSet, token: TokenDefinition): string {
  return `var(--${[tokenSet.projectId, ...token.path].join("-")})`;
}

function resolvedTypeFor(
  type: Exclude<TokenType, "typography">,
  tokens: readonly TokenDefinition[],
  modes: readonly TokenSet["modes"][number][],
): FigmaVariableResolvedType | undefined {
  switch (type) {
    case "color":
      return "COLOR";
    case "dimension":
    case "number":
      return "FLOAT";
    case "fontFamily":
      return "STRING";
    case "fontWeight": {
      const directValues = tokens.map((token, index) => {
        let current: TokenDefinition | undefined = token;
        const mode = modes[index];
        const seen = new Set<string>();
        while (current !== undefined && typeof current.$value === "string") {
          const reference = parseTokenReference(current.$value);
          if (reference === undefined) return current.$value;
          const key = reference.join("/");
          if (mode === undefined || seen.has(key)) return undefined;
          seen.add(key);
          current = mode.tokens.find(
            (candidate) => tokenPath(candidate) === key,
          );
        }
        return current?.$value;
      });
      if (directValues.some((value) => value === undefined)) return undefined;
      const kinds = new Set(directValues.map((value) => typeof value));
      if (kinds.size > 1) {
        return undefined;
      }
      return kinds.has("number") ? "FLOAT" : "STRING";
    }
  }
}

function semanticScopes(
  type: Exclude<TokenType, "typography">,
  path: readonly string[],
): readonly FigmaVariableScope[] | undefined {
  const name = path.join("-");
  switch (type) {
    case "color":
      if (/(?:^|-)border(?:-|$)/u.test(name)) return ["STROKE_COLOR"];
      if (/(?:^|-)(?:foreground|text|label)(?:-|$)/u.test(name)) {
        return ["TEXT_FILL"];
      }
      if (/(?:^|-)icon(?:-|$)/u.test(name)) return ["SHAPE_FILL"];
      if (/(?:^|-)background(?:-|$)/u.test(name)) {
        return ["FRAME_FILL", "SHAPE_FILL"];
      }
      return undefined;
    case "dimension":
      if (/(?:font-size)(?:-|$)/u.test(name)) return ["FONT_SIZE"];
      if (/(?:letter-spacing)(?:-|$)/u.test(name)) return ["LETTER_SPACING"];
      if (/(?:radius)(?:-|$)/u.test(name)) return ["CORNER_RADIUS"];
      if (/(?:border-width|stroke-width)(?:-|$)/u.test(name)) {
        return ["STROKE_FLOAT"];
      }
      if (/(?:padding|space|gap)(?:-|$)/u.test(name)) return ["GAP"];
      if (/(?:height|width|size)(?:-|$)/u.test(name)) return ["WIDTH_HEIGHT"];
      return undefined;
    case "fontFamily":
      return ["FONT_FAMILY"];
    case "fontWeight":
      return ["FONT_WEIGHT"];
    case "number":
      if (/(?:line-height)(?:-|$)/u.test(name)) return ["LINE_HEIGHT"];
      if (/(?:opacity)(?:-|$)/u.test(name)) return ["OPACITY"];
      return undefined;
  }
}

function mapDirectValue(
  token: TokenDefinition,
  value: unknown,
  opacityPercentage: boolean,
): FigmaVariablePlannedValue | undefined {
  switch (token.$type) {
    case "color":
      if (
        typeof value === "object" &&
        value !== null &&
        "components" in value &&
        Array.isArray(value.components) &&
        value.components.length === 3 &&
        value.components.every((component) => typeof component === "number")
      ) {
        const alpha = "alpha" in value ? value.alpha : undefined;
        const [r, g, b] = value.components;
        if (
          typeof r !== "number" ||
          typeof g !== "number" ||
          typeof b !== "number"
        ) {
          return undefined;
        }
        return {
          a: typeof alpha === "number" ? alpha : 1,
          b,
          g,
          kind: "color",
          r,
        };
      }
      return undefined;
    case "dimension":
      if (
        typeof value === "object" &&
        value !== null &&
        "unit" in value &&
        value.unit === "px" &&
        "value" in value &&
        typeof value.value === "number"
      ) {
        return { kind: "float", value: value.value };
      }
      return undefined;
    case "fontFamily":
      if (Array.isArray(value)) {
        const first: unknown = value[0];
        return typeof first === "string"
          ? { kind: "string", value: first }
          : undefined;
      }
      return typeof value === "string" ? { kind: "string", value } : undefined;
    case "fontWeight":
      if (typeof value === "number") return { kind: "float", value };
      return typeof value === "string" ? { kind: "string", value } : undefined;
    case "number":
      if (typeof value === "number") {
        return {
          kind: "float",
          value: opacityPercentage ? value * 100 : value,
        };
      }
      return undefined;
    case "typography":
      return undefined;
  }
}

function failure(
  tokenSet: TokenSet,
  message: string,
  issue: string,
): ToolkitResult<FigmaVariablePlan> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issue } },
      message,
      recoveryInstruction:
        "Correct the Token Set or provide an explicit supported mapping before retrying the Figma write.",
      target: {
        logicalId: tokenSet.assetId,
        type: "token-set",
        version: tokenSet.assetVersion,
      },
    }),
  );
}

function directUsageScopes(
  tokenSet: TokenSet,
): ReadonlyMap<string, ReadonlySet<FigmaVariableScope>> {
  const scopes = new Map<string, Set<FigmaVariableScope>>();
  for (const mode of tokenSet.modes) {
    for (const token of mode.tokens) {
      if (token.path[0] === "primitive" || token.$type === "typography")
        continue;
      const tokenScopes = semanticScopes(token.$type, token.path);
      const reference =
        typeof token.$value === "string"
          ? parseTokenReference(token.$value)?.join("/")
          : undefined;
      if (reference === undefined || tokenScopes === undefined) continue;
      const existing = scopes.get(reference) ?? new Set<FigmaVariableScope>();
      tokenScopes.forEach((scope) => existing.add(scope));
      scopes.set(reference, existing);
    }
  }
  return scopes;
}

export function createFigmaVariablePlan(
  input: unknown,
  contentDigest: string,
): ToolkitResult<FigmaVariablePlan> {
  const tokenResult = validateTokenSet(input);
  if (!tokenResult.ok) return tokenResult;
  const digestResult = contentDigestSchema.safeParse(contentDigest);
  if (!digestResult.success) {
    return failure(
      tokenResult.data,
      "The Figma Variable plan requires a verified Token Set content digest.",
      "content_digest_invalid",
    );
  }
  const tokenSet = tokenResult.data;
  if (
    tokenSet.contentDigest !== undefined &&
    tokenSet.contentDigest !== digestResult.data
  ) {
    return failure(
      tokenSet,
      "The verified content digest does not match the Token Set.",
      "content_digest_mismatch",
    );
  }

  const baseline = tokenSet.modes.find(
    (mode) => mode.id === tokenSet.defaultMode,
  );
  if (baseline === undefined) {
    return failure(
      tokenSet,
      "The default Token mode is missing.",
      "default_mode_missing",
    );
  }
  const plannedMajorVersion = majorVersion(tokenSet.assetVersion);
  if (!Number.isSafeInteger(plannedMajorVersion)) {
    return failure(
      tokenSet,
      "The Token Set Major version is too large for a Figma identity.",
      "figma_major_version_out_of_range",
    );
  }
  if (collectionStableId(tokenSet).length > 192) {
    return failure(
      tokenSet,
      "The derived Figma Variable Collection identity is too long.",
      "figma_identity_too_long",
    );
  }
  const modes = [
    baseline,
    ...tokenSet.modes.filter((mode) => mode !== baseline),
  ];
  const usages = directUsageScopes(tokenSet);
  const warnings: ResultWarning[] = [];
  const variables: VariableSpec[] = [];
  const deferredTypography: FigmaVariablePlan["deferredTypography"] = [];

  for (const baselineToken of baseline.tokens) {
    const path = tokenPath(baselineToken);
    const plannedTokenIdentity =
      baselineToken.$type === "typography"
        ? `${collectionStableId(tokenSet)}/typography/${path}`
        : variableStableId(tokenSet, baselineToken);
    if (path.length > 192 || plannedTokenIdentity.length > 192) {
      return failure(
        tokenSet,
        `Token '${path}' produces a Figma managed identity longer than 192 characters.`,
        "figma_identity_too_long",
      );
    }
    if (baselineToken.$type === "typography") {
      deferredTypography.push({
        description: baselineToken.$description,
        stableId: plannedTokenIdentity,
        tokenPath: path,
      });
      warnings.push({
        code: "FIGMA_TYPOGRAPHY_STYLE_DEFERRED",
        message: `Typography token '${path}' will be materialized as a composite style, not a Variable.`,
        target: { logicalId: path, type: "token" },
      });
      continue;
    }

    const modeTokens = modes.map((mode) => {
      const token = mode.tokens.find(
        (candidate) => tokenPath(candidate) === path,
      );
      if (token === undefined)
        throw new Error("Validated Token mode parity drifted.");
      return token;
    });
    const resolvedType = resolvedTypeFor(
      baselineToken.$type,
      modeTokens,
      modes,
    );
    if (resolvedType === undefined) {
      return failure(
        tokenSet,
        `Token '${path}' cannot keep one Figma Variable type across all modes.`,
        "resolved_type_conflict",
      );
    }
    const scopes =
      baselineToken.path[0] === "primitive"
        ? []
        : semanticScopes(baselineToken.$type, baselineToken.path);
    if (scopes === undefined) {
      return failure(
        tokenSet,
        `Token '${path}' has no precise Figma scope mapping.`,
        "scope_mapping_required",
      );
    }
    const primitiveUsageScopes =
      usages.get(path) ?? new Set<FigmaVariableScope>();
    const opacityPercentage =
      baselineToken.$type === "number" &&
      primitiveUsageScopes.size === 1 &&
      primitiveUsageScopes.has("OPACITY");
    if (
      baselineToken.$type === "number" &&
      primitiveUsageScopes.has("OPACITY") &&
      !opacityPercentage
    ) {
      return failure(
        tokenSet,
        `Primitive number token '${path}' mixes opacity and non-opacity usages.`,
        "incompatible_number_units",
      );
    }

    const values: VariableSpec["values"] = [];
    for (let index = 0; index < modeTokens.length; index += 1) {
      const modeToken = modeTokens[index];
      const mode = modes[index];
      if (modeToken === undefined || mode === undefined) continue;
      let value: FigmaVariablePlannedValue | undefined;
      if (typeof modeToken.$value === "string") {
        const reference = parseTokenReference(modeToken.$value);
        value =
          reference === undefined
            ? mapDirectValue(modeToken, modeToken.$value, opacityPercentage)
            : {
                kind: "alias",
                targetStableId: `${collectionStableId(tokenSet)}/variable/${reference.join("/")}`,
              };
      } else {
        value = mapDirectValue(modeToken, modeToken.$value, opacityPercentage);
      }
      if (value === undefined) {
        const issue =
          modeToken.$type === "dimension" &&
          typeof modeToken.$value === "object" &&
          "unit" in modeToken.$value &&
          modeToken.$value.unit === "rem"
            ? "rem_conversion_required"
            : "value_mapping_required";
        return failure(
          tokenSet,
          `Token '${path}' in mode '${mode.id}' cannot be mapped safely to Figma.`,
          issue,
        );
      }
      values.push({ modeStableId: modeStableId(tokenSet, mode.id), value });
    }

    if (
      baselineToken.$type === "fontFamily" &&
      modeTokens.some(
        (token) => Array.isArray(token.$value) && token.$value.length > 1,
      )
    ) {
      warnings.push({
        code: "FIGMA_FONT_FALLBACKS_METADATA_ONLY",
        message: `Figma Variable '${path}' uses the first font family; the source Token Set remains authoritative for fallbacks.`,
        target: { logicalId: path, type: "token" },
      });
    }

    variables.push({
      codeSyntax: cssCustomProperty(tokenSet, baselineToken),
      description: baselineToken.$description,
      hiddenFromPublishing: baselineToken.path[0] === "primitive",
      name: path,
      resolvedType,
      scopes: [...scopes],
      stableId: variableStableId(tokenSet, baselineToken),
      tokenPath: path,
      tokenType: baselineToken.$type,
      values,
    });
  }

  const parsedPlan = figmaVariablePlanSchema.safeParse({
    collection: {
      defaultModeId: modeStableId(tokenSet, tokenSet.defaultMode),
      description: tokenSet.description,
      majorVersion: majorVersion(tokenSet.assetVersion),
      modes: modes.map((mode) => ({
        name: mode.name,
        stableId: modeStableId(tokenSet, mode.id),
      })),
      name: collectionName(tokenSet),
      stableId: collectionStableId(tokenSet),
    },
    deferredTypography,
    schemaVersion: FIGMA_VARIABLE_PLAN_SCHEMA_VERSION,
    source: {
      assetId: tokenSet.assetId,
      assetVersion: tokenSet.assetVersion,
      contentDigest: digestResult.data,
      projectId: tokenSet.projectId,
    },
    variables,
  });
  if (!parsedPlan.success) {
    return failure(
      tokenSet,
      "The generated Figma Variable plan did not satisfy its own contract.",
      "generated_plan_invalid",
    );
  }
  return createSuccessResult(parsedPlan.data, warnings);
}
