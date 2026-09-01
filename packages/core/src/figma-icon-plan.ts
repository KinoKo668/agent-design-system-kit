import * as z from "zod";

import { createToolkitError } from "./errors.js";
import { createFigmaVariablePlan } from "./figma-variable-plan.js";
import {
  validateIconComponentContractWithTokenSet,
  type IconComponentContract,
} from "./icon-contract.js";
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

export const FIGMA_ICON_PLAN_SCHEMA_VERSION = "1.0.0" as const;

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

export const figmaIconPlanSchema = z
  .object({
    accessibility: z
      .object({
        defaultPresentation: z.literal("decorative"),
        interactiveTargetOwner: z.literal("consumer"),
        minimumInteractiveTarget: z.literal(44),
        semanticUsageRequiresAccessibleName: z.literal(true),
      })
      .strict(),
    componentSet: z
      .object({
        defaultSize: z.literal("Medium"),
        description: boundedText(2_000),
        majorVersion: z.number().int().nonnegative(),
        name: boundedText(120),
        sizeOptions: z.tuple([
          z.literal("Small"),
          z.literal("Medium"),
          z.literal("Large"),
        ]),
        sizePropertyName: z.literal("Size"),
        slotId: z.literal("root"),
        stableId: stableAssetIdSchema,
      })
      .strict(),
    glyph: z
      .object({
        color: z
          .object({
            fallback: colorSchema,
            variableStableId: stableAssetIdSchema,
          })
          .strict(),
        name: z.literal("Glyph"),
        opticalGrid: z.literal(24),
        pathData: z.literal("M5 12.5L10 17.5L19 7.5"),
        safeArea: z.literal(2),
        strokeCap: z.literal("ROUND"),
        strokeJoin: z.literal("ROUND"),
        strokeWidth: z.literal(2),
      })
      .strict(),
    schemaVersion: z.literal(FIGMA_ICON_PLAN_SCHEMA_VERSION),
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
    variants: z
      .array(
        z
          .object({
            figmaName: boundedText(120),
            frame: z
              .object({
                size: z.number().positive(),
                variableStableId: stableAssetIdSchema,
              })
              .strict(),
            glyph: z
              .object({
                height: z.number().positive(),
                scale: z.number().positive(),
                strokeWidth: z.number().positive(),
                width: z.number().positive(),
                x: z.number().nonnegative(),
                y: z.number().nonnegative(),
              })
              .strict(),
            id: stableAssetIdSchema,
            size: z.enum(["small", "medium", "large"]),
            slotId: stableAssetIdSchema,
            stableId: stableAssetIdSchema,
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .superRefine((plan, context) => {
    const root = `${plan.source.projectId}/component/${plan.source.assetId}/component-set/major-${String(plan.componentSet.majorVersion)}`;
    if (plan.componentSet.stableId !== root) {
      context.addIssue({
        code: "custom",
        message: "Icon Component Set identity does not match its source.",
        path: ["componentSet", "stableId"],
      });
    }
    if (
      Number(plan.source.assetVersion.split(".")[0]) !==
      plan.componentSet.majorVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Icon Component Set Major version does not match its source.",
        path: ["componentSet", "majorVersion"],
      });
    }
    const collection = `${plan.tokenSource.projectId}/token-set/${plan.tokenSource.assetId}/variables/major-${plan.tokenSource.assetVersion.split(".")[0]}`;
    if (plan.tokenSource.collectionStableId !== collection) {
      context.addIssue({
        code: "custom",
        message: "Icon Token Collection identity does not match its source.",
        path: ["tokenSource", "collectionStableId"],
      });
    }
    const variablePrefix = `${collection}/variable/`;
    if (!plan.glyph.color.variableStableId.startsWith(variablePrefix)) {
      context.addIssue({
        code: "custom",
        message: "Icon color Variable must belong to its Token Collection.",
        path: ["glyph", "color", "variableStableId"],
      });
    }
    const names = new Set<string>();
    const sizes = new Set<string>();
    for (const [index, variant] of plan.variants.entries()) {
      if (
        variant.stableId !== `${root}/${variant.slotId}` ||
        !variant.frame.variableStableId.startsWith(variablePrefix) ||
        names.has(variant.figmaName) ||
        sizes.has(variant.size)
      ) {
        context.addIssue({
          code: "custom",
          message: "Every Icon Variant must have one unique derived identity.",
          path: ["variants", index],
        });
      }
      names.add(variant.figmaName);
      sizes.add(variant.size);
    }
  });

export type FigmaIconPlan = z.infer<typeof figmaIconPlanSchema>;
type TokenDefinition = TokenSet["modes"][number]["tokens"][number];

function fail(
  contract: IconComponentContract,
  message: string,
  issue: string,
): ToolkitResult<FigmaIconPlan> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issue } },
      message,
      recoveryInstruction:
        "Correct the Icon Contract or Token Set and regenerate the Figma plan.",
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

function variableStableId(
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

export function createFigmaIconPlan(
  contractInput: unknown,
  tokenSetInput: unknown,
  componentDigest: string,
  tokenDigest: string,
): ToolkitResult<FigmaIconPlan> {
  const validated = validateIconComponentContractWithTokenSet(
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
      "The Icon plan requires verified source digests.",
      "content_digest_invalid",
    );
  }
  if (
    contract.contentDigest !== undefined &&
    contract.contentDigest !== componentDigestResult.data
  ) {
    return fail(
      contract,
      "The verified digest does not match the Icon Contract.",
      "component_digest_mismatch",
    );
  }
  if (
    tokenSet.contentDigest !== undefined &&
    tokenSet.contentDigest !== tokenDigestResult.data
  ) {
    return fail(
      contract,
      "The verified digest does not match the Icon Token Set.",
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
      "The default Icon Token mode is missing.",
      "default_mode_missing",
    );
  }
  const index = new Map(
    baseline.tokens.map((token) => [token.path.join("/"), token]),
  );
  const collectionStableId = variablePlan.data.collection.stableId;
  const colorReference = contract.sharedBindings[0]?.token;
  const colorValue =
    colorReference === undefined
      ? undefined
      : directValue(index, colorReference);
  const colorId =
    colorReference === undefined
      ? undefined
      : variableStableId(collectionStableId, colorReference);
  if (
    typeof colorValue !== "object" ||
    colorValue === null ||
    !("components" in colorValue) ||
    !Array.isArray(colorValue.components) ||
    colorValue.components.length !== 3 ||
    !colorValue.components.every((channel) => typeof channel === "number") ||
    colorId === undefined
  ) {
    return fail(
      contract,
      "The Icon color Token cannot be mapped safely to Figma.",
      "color_mapping_failed",
    );
  }
  const [r, g, b] = colorValue.components as [number, number, number];
  const major = Number(contract.assetVersion.split(".")[0]);
  const rootStableId = `${contract.projectId}/component/${contract.assetId}/component-set/major-${String(major)}`;
  if (!Number.isSafeInteger(major) || rootStableId.length > 192) {
    return fail(
      contract,
      "The Icon identity cannot be represented safely in Figma.",
      "figma_identity_invalid",
    );
  }
  const sizeProperty = contract.properties[0];
  if (sizeProperty === undefined)
    throw new Error("Validated Icon property drifted.");
  const variants: FigmaIconPlan["variants"] = [];
  for (const variant of contract.variants) {
    const reference = variant.bindings[0]?.token;
    const size =
      reference === undefined
        ? undefined
        : dimension(directValue(index, reference));
    const sizeVariable =
      reference === undefined
        ? undefined
        : variableStableId(collectionStableId, reference);
    const figmaName = sizeProperty.options.find(
      ({ id }) => id === variant.selections.size,
    )?.figmaValue;
    if (
      size === undefined ||
      sizeVariable === undefined ||
      figmaName === undefined
    ) {
      return fail(
        contract,
        `Icon Variant '${variant.id}' cannot be mapped safely to Figma.`,
        "variant_mapping_failed",
      );
    }
    const scale = size / contract.geometry.opticalGrid;
    variants.push({
      figmaName: `${sizeProperty.figmaName}=${figmaName}`,
      frame: { size, variableStableId: sizeVariable },
      glyph: {
        height: 10 * scale,
        scale,
        strokeWidth: contract.geometry.strokeWidth * scale,
        width: 14 * scale,
        x: 5 * scale,
        y: 7.5 * scale,
      },
      id: variant.id,
      size: variant.selections.size,
      slotId: variant.slotId,
      stableId: `${rootStableId}/${variant.slotId}`,
    });
  }
  const parsed = figmaIconPlanSchema.safeParse({
    accessibility: contract.accessibility,
    componentSet: {
      defaultSize: "Medium",
      description: contract.description,
      majorVersion: major,
      name:
        major === 1 ? contract.name : `${contract.name} / v${String(major)}`,
      sizeOptions: ["Small", "Medium", "Large"],
      sizePropertyName: sizeProperty.figmaName,
      slotId: "root",
      stableId: rootStableId,
    },
    glyph: {
      color: {
        fallback: {
          a:
            "alpha" in colorValue && typeof colorValue.alpha === "number"
              ? colorValue.alpha
              : 1,
          b,
          g,
          r,
        },
        variableStableId: colorId,
      },
      name: "Glyph",
      opticalGrid: contract.geometry.opticalGrid,
      pathData: contract.geometry.pathData,
      safeArea: contract.geometry.safeArea,
      strokeCap: "ROUND",
      strokeJoin: "ROUND",
      strokeWidth: contract.geometry.strokeWidth,
    },
    schemaVersion: FIGMA_ICON_PLAN_SCHEMA_VERSION,
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
    variants,
  });
  return parsed.success
    ? createSuccessResult(parsed.data, variablePlan.warnings)
    : fail(
        contract,
        "The generated Icon plan failed its strict invariant check.",
        "generated_plan_invalid",
      );
}
