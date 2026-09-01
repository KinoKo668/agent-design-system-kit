import * as z from "zod";

import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  getProvidedSchemaVersion,
  toValidationIssues,
  type SchemaValidationIssue,
} from "./schema-validation.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";

export const DESIGN_BRIEF_SCHEMA_VERSION = "1.0.0" as const;
export const DESIGN_BRIEF_ASSET_TYPE = "brief" as const;

const PRIVATE_FIGMA_URL_PATTERN =
  /^https:\/\/(?:www\.)?figma\.com\/(?:board|design|file|proto)\//iu;

function requiredText(maxLength: number): z.ZodString {
  return z
    .string()
    .min(1, "Must not be empty.")
    .max(maxLength, `Must contain at most ${String(maxLength)} characters.`)
    .refine((value) => value.trim() === value, {
      message: "Must not start or end with whitespace.",
    })
    .refine((value) => !containsDisallowedControlCharacter(value), {
      message: "Must not contain control characters.",
    });
}

function containsDisallowedControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }

  return false;
}

const stableLocalIdSchema = stableIdSegmentSchema;
const titleSchema = requiredText(120);
const shortTextSchema = requiredText(240);
const longTextSchema = requiredText(2_000);

const productSchema = z.strictObject({
  problem: longTextSchema,
  summary: shortTextSchema,
  valueProposition: longTextSchema,
});

const goalSchema = z.strictObject({
  id: stableLocalIdSchema,
  statement: longTextSchema,
  successSignal: longTextSchema,
});

const audienceSchema = z.strictObject({
  description: longTextSchema,
  id: stableLocalIdSchema,
  name: titleSchema,
  needs: z.array(shortTextSchema).min(1).max(12),
});

const scenarioSchema = z.strictObject({
  audienceIds: z.array(stableLocalIdSchema).min(1).max(12),
  description: longTextSchema,
  id: stableLocalIdSchema,
  name: titleSchema,
  priority: z.enum(["primary", "secondary"]),
});

const brandSchema = z.strictObject({
  attributes: z.array(shortTextSchema).min(2).max(8),
  avoid: z.array(shortTextSchema).min(1).max(12),
  principles: z.array(longTextSchema).min(1).max(12),
});

const platformSchema = z.strictObject({
  formFactors: z
    .array(
      z.enum([
        "desktop",
        "foldable",
        "headset",
        "mobile",
        "other",
        "tablet",
        "tv",
        "watch",
      ]),
    )
    .min(1),
  id: stableLocalIdSchema,
  inputMethods: z
    .array(
      z.enum([
        "gamepad",
        "keyboard",
        "other",
        "pointer",
        "remote",
        "touch",
        "voice",
      ]),
    )
    .min(1),
  kind: z.enum([
    "android",
    "figma-plugin",
    "ios",
    "macos",
    "other",
    "visionos",
    "watchos",
    "web",
    "windows",
  ]),
  name: titleSchema,
});

const constraintSchema = z.strictObject({
  category: z.enum([
    "accessibility",
    "brand",
    "business",
    "content",
    "legal",
    "technical",
    "timeline",
    "other",
  ]),
  id: stableLocalIdSchema,
  statement: longTextSchema,
});

const accessibilitySchema = z.strictObject({
  requirements: z.array(longTextSchema).min(1).max(20),
  standards: z
    .array(
      z.enum([
        "apple-hig",
        "custom",
        "material-design",
        "wcag-2.2-aa",
        "wcag-2.2-aaa",
      ]),
    )
    .min(1),
});

const referenceUrlSchema = z
  .string()
  .max(2_048)
  .url("Must be an absolute URL.")
  .refine((value) => value.startsWith("https://"), {
    message: "Must use HTTPS.",
  })
  .refine((value) => !PRIVATE_FIGMA_URL_PATTERN.test(value), {
    message:
      "Private Figma file URLs must not be stored in a public Design Brief.",
  });

const referenceSchema = z.strictObject({
  name: titleSchema,
  reason: longTextSchema,
  url: referenceUrlSchema.optional(),
});

function addDuplicateIdIssues(
  values: readonly { readonly id: string }[],
  path: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate id '${value.id}'.`,
        path: [path, index, "id"],
      });
    }
    seen.add(value.id);
  });
}

function addDuplicateStringIssues(
  values: readonly string[],
  path: readonly (number | string)[],
  context: z.RefinementCtx,
  caseInsensitive = false,
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    const comparisonValue = caseInsensitive ? value.toLowerCase() : value;
    if (seen.has(comparisonValue)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate value '${value}'.`,
        path: [...path, index],
      });
    }
    seen.add(comparisonValue);
  });
}

export const designBriefSchema = z
  .strictObject({
    accessibility: accessibilitySchema,
    assetId: stableAssetIdSchema,
    assetType: z.literal(DESIGN_BRIEF_ASSET_TYPE),
    assetVersion: strictSemverSchema,
    audiences: z.array(audienceSchema).min(1).max(12),
    brand: brandSchema,
    constraints: z.array(constraintSchema).min(1).max(30),
    contentDigest: contentDigestSchema.optional(),
    goals: z.array(goalSchema).min(1).max(12),
    platforms: z.array(platformSchema).min(1).max(12),
    product: productSchema,
    projectId: stableIdSegmentSchema,
    references: z.array(referenceSchema).max(20).optional(),
    scenarios: z.array(scenarioSchema).min(1).max(20),
    schemaVersion: z.literal(DESIGN_BRIEF_SCHEMA_VERSION),
    title: titleSchema,
  })
  .superRefine((brief, context) => {
    addDuplicateIdIssues(brief.goals, "goals", context);
    addDuplicateIdIssues(brief.audiences, "audiences", context);
    addDuplicateIdIssues(brief.scenarios, "scenarios", context);
    addDuplicateIdIssues(brief.platforms, "platforms", context);
    addDuplicateIdIssues(brief.constraints, "constraints", context);
    addDuplicateStringIssues(
      brief.brand.attributes,
      ["brand", "attributes"],
      context,
      true,
    );
    addDuplicateStringIssues(
      brief.brand.principles,
      ["brand", "principles"],
      context,
      true,
    );
    addDuplicateStringIssues(
      brief.brand.avoid,
      ["brand", "avoid"],
      context,
      true,
    );
    addDuplicateStringIssues(
      brief.accessibility.standards,
      ["accessibility", "standards"],
      context,
    );
    addDuplicateStringIssues(
      brief.accessibility.requirements,
      ["accessibility", "requirements"],
      context,
      true,
    );

    for (const [audienceIndex, audience] of brief.audiences.entries()) {
      addDuplicateStringIssues(
        audience.needs,
        ["audiences", audienceIndex, "needs"],
        context,
        true,
      );
    }

    for (const [platformIndex, platform] of brief.platforms.entries()) {
      addDuplicateStringIssues(
        platform.formFactors,
        ["platforms", platformIndex, "formFactors"],
        context,
      );
      addDuplicateStringIssues(
        platform.inputMethods,
        ["platforms", platformIndex, "inputMethods"],
        context,
      );
    }

    const audienceIds = new Set(brief.audiences.map((audience) => audience.id));
    for (const [scenarioIndex, scenario] of brief.scenarios.entries()) {
      addDuplicateStringIssues(
        scenario.audienceIds,
        ["scenarios", scenarioIndex, "audienceIds"],
        context,
      );

      for (const [
        audienceIndex,
        audienceId,
      ] of scenario.audienceIds.entries()) {
        if (!audienceIds.has(audienceId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown audience id '${audienceId}'.`,
            path: ["scenarios", scenarioIndex, "audienceIds", audienceIndex],
          });
        }
      }
    }
  });

export type DesignBrief = z.infer<typeof designBriefSchema>;
export type DesignBriefDigestSubject = Omit<DesignBrief, "contentDigest">;

export type DesignBriefValidationIssue = SchemaValidationIssue;

export function validateDesignBrief(
  input: unknown,
): ToolkitResult<DesignBrief> {
  const providedVersion = getProvidedSchemaVersion(input);
  if (
    providedVersion !== undefined &&
    providedVersion.schemaVersion !== DESIGN_BRIEF_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: providedVersion,
          expected: { schemaVersion: DESIGN_BRIEF_SCHEMA_VERSION },
        },
        message: "The Design Brief schema version is not supported.",
        recoveryInstruction:
          "Use Design Brief schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "design-brief-schema",
          type: "schema",
          version: providedVersion.schemaVersion,
        },
      }),
    );
  }

  const result = designBriefSchema.safeParse(input);
  if (result.success) {
    return createSuccessResult(result.data);
  }

  const issues = toValidationIssues(result.error);

  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The Design Brief contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again.",
      target: {
        logicalId: "design-brief",
        type: "brief",
      },
    }),
  );
}

export function toDesignBriefDigestSubject(
  brief: DesignBrief,
): DesignBriefDigestSubject {
  return {
    accessibility: brief.accessibility,
    assetId: brief.assetId,
    assetType: brief.assetType,
    assetVersion: brief.assetVersion,
    audiences: brief.audiences,
    brand: brief.brand,
    constraints: brief.constraints,
    goals: brief.goals,
    platforms: brief.platforms,
    product: brief.product,
    projectId: brief.projectId,
    ...(brief.references === undefined ? {} : { references: brief.references }),
    scenarios: brief.scenarios,
    schemaVersion: brief.schemaVersion,
    title: brief.title,
  };
}
