import * as z from "zod";

import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import type { JsonObject, JsonValue } from "./json.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { semanticVersionMajor } from "./semantic-version.js";

export const FIGMA_COMPONENT_AUDIT_SCHEMA_VERSION = "1.0.0" as const;
export const COMPONENT_AUDIT_FINDING_CODES = [
  "DETACHED_OR_APPROXIMATE_COMPONENT",
  "UNREGISTERED_COMPONENT_SOURCE",
  "UNREGISTERED_VARIANT",
  "VARIANT_PROPERTY_MISMATCH",
  "INSTANCE_PROVENANCE_MISMATCH",
] as const;

const nodeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^\d+:\d+$/u);
const boundedPropertiesSchema = z
  .record(z.string().min(1).max(120), z.string().min(1).max(500))
  .refine((properties) => Object.keys(properties).length <= 50, {
    message: "Component Variant properties must contain at most 50 entries.",
  });
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const componentAuditVariantSchema = z
  .object({
    figmaName: z.string().min(1).max(240),
    properties: boundedPropertiesSchema,
    slotId: stableAssetIdSchema,
    stableId: stableAssetIdSchema,
  })
  .strict();

const componentAuditSourceSchema = z
  .object({
    assetId: stableAssetIdSchema,
    assetVersion: strictSemverSchema,
    componentSetNodeId: nodeIdSchema,
    componentSetStableId: stableAssetIdSchema,
    contentDigest: contentDigestSchema,
    variants: z.array(componentAuditVariantSchema).min(1).max(200),
  })
  .strict();

export const figmaComponentAuditPlanSchema = z
  .object({
    fileBindingId: z.uuid(),
    projectId: stableIdSegmentSchema,
    schemaVersion: z.literal(FIGMA_COMPONENT_AUDIT_SCHEMA_VERSION),
    scope: z.literal("current-page"),
    sources: z.array(componentAuditSourceSchema).min(1).max(500),
  })
  .strict()
  .superRefine((plan, context) => {
    const sourceIds = new Set<string>();
    const variantIds = new Set<string>();
    plan.sources.forEach((source, sourceIndex) => {
      const expectedRoot = `${plan.projectId}/component/${source.assetId}/component-set/major-${semanticVersionMajor(source.assetVersion)}`;
      if (
        source.componentSetStableId !== expectedRoot ||
        sourceIds.has(source.componentSetStableId)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Component audit source identities must be exact and unique.",
          path: ["sources", sourceIndex, "componentSetStableId"],
        });
      }
      sourceIds.add(source.componentSetStableId);
      source.variants.forEach((variant, variantIndex) => {
        if (
          variant.stableId !== `${expectedRoot}/${variant.slotId}` ||
          variantIds.has(variant.stableId)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Component audit Variant identities must be exact and unique.",
            path: [
              "sources",
              sourceIndex,
              "variants",
              variantIndex,
              "stableId",
            ],
          });
        }
        variantIds.add(variant.stableId);
      });
    });
  });

export type FigmaComponentAuditPlan = z.infer<
  typeof figmaComponentAuditPlanSchema
>;

const auditNodeSchema = z
  .object({
    id: nodeIdSchema,
    name: z.string().min(1).max(256),
    type: z.string().min(1).max(64),
  })
  .strict();

const managedInstanceSchema = z
  .object({
    componentSetStableId: stableAssetIdSchema.nullable(),
    instanceStableId: stableAssetIdSchema.nullable(),
    phase: z.enum(["applied", "creating", "invalid"]),
    variantStableId: stableAssetIdSchema.nullable(),
  })
  .strict()
  .superRefine((marker, context) => {
    if (
      marker.phase !== "invalid" &&
      (marker.componentSetStableId === null ||
        marker.instanceStableId === null ||
        marker.variantStableId === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A valid managed Instance marker requires complete identities.",
      });
    }
  });

export const figmaComponentObservationSchema = z
  .object({
    managedInstance: managedInstanceSchema.nullable(),
    node: auditNodeSchema,
    source: z
      .object({
        componentNodeId: nodeIdSchema,
        componentSetNodeId: nodeIdSchema.nullable(),
        componentSetStableId: stableAssetIdSchema.nullable(),
        componentStableId: stableAssetIdSchema.nullable(),
        variantProperties: boundedPropertiesSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export type FigmaComponentObservation = z.infer<
  typeof figmaComponentObservationSchema
>;

export const figmaComponentAuditFindingSchema = z
  .object({
    actual: z.record(z.string(), jsonValueSchema),
    code: z.enum(COMPONENT_AUDIT_FINDING_CODES),
    expected: z.record(z.string(), jsonValueSchema),
    node: auditNodeSchema,
    recoveryInstruction: z.string().min(1).max(500),
    severity: z.literal("error"),
  })
  .strict();

export type FigmaComponentAuditFinding = z.infer<
  typeof figmaComponentAuditFindingSchema
>;

export const figmaComponentAuditResultSchema = z
  .object({
    findings: z.array(figmaComponentAuditFindingSchema).max(10_000),
    page: z
      .object({ id: nodeIdSchema, name: z.string().min(1).max(256) })
      .strict(),
    passed: z.boolean(),
    schemaVersion: z.literal(FIGMA_COMPONENT_AUDIT_SCHEMA_VERSION),
    scope: z.literal("current-page"),
    summary: z
      .object({
        auditedNodes: z.number().int().nonnegative(),
        compliantInstances: z.number().int().nonnegative(),
        detachedOrApproximate: z.number().int().nonnegative(),
        provenanceMismatches: z.number().int().nonnegative(),
        unregisteredSources: z.number().int().nonnegative(),
        unregisteredVariants: z.number().int().nonnegative(),
        variantPropertyMismatches: z.number().int().nonnegative(),
      })
      .strict(),
    type: z.literal("audit.components.scan"),
  })
  .strict()
  .superRefine((result, context) => {
    const count = (code: FigmaComponentAuditFinding["code"]) =>
      result.findings.filter((finding) => finding.code === code).length;
    const nodesWithFindings = new Set(
      result.findings.map(({ node }) => node.id),
    ).size;
    if (
      result.passed !== (result.findings.length === 0) ||
      result.summary.detachedOrApproximate !==
        count("DETACHED_OR_APPROXIMATE_COMPONENT") ||
      result.summary.provenanceMismatches !==
        count("INSTANCE_PROVENANCE_MISMATCH") ||
      result.summary.unregisteredSources !==
        count("UNREGISTERED_COMPONENT_SOURCE") ||
      result.summary.unregisteredVariants !== count("UNREGISTERED_VARIANT") ||
      result.summary.variantPropertyMismatches !==
        count("VARIANT_PROPERTY_MISMATCH") ||
      result.summary.auditedNodes !==
        result.summary.compliantInstances + nodesWithFindings
    ) {
      context.addIssue({
        code: "custom",
        message: "Component audit summary must exactly match its findings.",
        path: ["summary"],
      });
    }
  });

export type FigmaComponentAuditResult = z.infer<
  typeof figmaComponentAuditResultSchema
>;

function failure(
  code: "IDENTITY_CONFLICT" | "IDENTITY_NOT_FOUND" | "VALIDATION_FAILED",
  message: string,
  recoveryInstruction: string,
): ToolkitResult<never> {
  return createFailureResult(
    createToolkitError({
      code,
      message,
      recoveryInstruction,
      target: { logicalId: "component-audit", type: "operation" },
    }),
  );
}

export function createFigmaComponentAuditPlan(
  snapshot: DesignSystemSnapshot,
): ToolkitResult<FigmaComponentAuditPlan> {
  const activeEntries = snapshot.registries.flatMap(({ data }) =>
    data.entries.filter(
      (entry) => entry.lifecycle === "active" && entry.figma.status === "ready",
    ),
  );
  const fileBindingIds = new Set(
    activeEntries.map((entry) => entry.figma.fileBindingId),
  );
  if (fileBindingIds.size === 0) {
    return failure(
      "IDENTITY_NOT_FOUND",
      "No active Ready Figma component source is available for audit.",
      "Ensure and register an approved component library before auditing its page.",
    );
  }
  if (fileBindingIds.size > 1) {
    return failure(
      "IDENTITY_CONFLICT",
      "The component audit scope spans more than one Figma file binding.",
      "Select one registered Figma file before running the current-page audit.",
    );
  }
  const sources = activeEntries.flatMap((entry) => {
    if (entry.figma.status !== "ready") return [];
    const contract = snapshot.components.find(
      ({ data }) =>
        data.assetId === entry.asset.id &&
        data.assetVersion === entry.asset.version,
    )?.data;
    if (contract === undefined) return [];
    const variantProperties = contract.properties.filter(
      (property) => property.kind === "variant",
    );
    return [
      {
        assetId: contract.assetId,
        assetVersion: contract.assetVersion,
        componentSetNodeId: entry.figma.locator.nodeId,
        componentSetStableId: `${snapshot.projectId}/component/${contract.assetId}/component-set/major-${semanticVersionMajor(contract.assetVersion)}`,
        contentDigest: entry.asset.contentDigest,
        variants: contract.variants.map((variant) => ({
          figmaName: variantProperties
            .map((property) => {
              const option = property.options.find(
                ({ id }) => id === variant.selections[property.id],
              );
              return `${property.figmaName}=${option?.figmaValue ?? ""}`;
            })
            .join(", "),
          properties: Object.fromEntries(
            variantProperties.map((property) => {
              const option = property.options.find(
                ({ id }) => id === variant.selections[property.id],
              );
              return [property.figmaName, option?.figmaValue ?? ""];
            }),
          ),
          slotId: variant.slotId,
          stableId: `${snapshot.projectId}/component/${contract.assetId}/component-set/major-${semanticVersionMajor(contract.assetVersion)}/${variant.slotId}`,
        })),
      },
    ];
  });
  const parsed = figmaComponentAuditPlanSchema.safeParse({
    fileBindingId: [...fileBindingIds][0],
    projectId: snapshot.projectId,
    schemaVersion: FIGMA_COMPONENT_AUDIT_SCHEMA_VERSION,
    scope: "current-page",
    sources: sources.sort((left, right) =>
      left.componentSetStableId.localeCompare(right.componentSetStableId),
    ),
  });
  return parsed.success
    ? createSuccessResult(parsed.data)
    : failure(
        "VALIDATION_FAILED",
        "The validated design system could not produce a component audit plan.",
        "Repair the active Registry and Component Contracts before retrying.",
      );
}

function finding(
  code: FigmaComponentAuditFinding["code"],
  observation: FigmaComponentObservation,
  actual: JsonObject,
  expected: JsonObject,
  recoveryInstruction: string,
): FigmaComponentAuditFinding {
  return {
    actual,
    code,
    expected,
    node: observation.node,
    recoveryInstruction,
    severity: "error",
  };
}

export function auditFigmaComponentObservations(
  planInput: unknown,
  pageInput: unknown,
  observationsInput: unknown,
): ToolkitResult<FigmaComponentAuditResult> {
  const plan = figmaComponentAuditPlanSchema.safeParse(planInput);
  const page = z
    .object({ id: nodeIdSchema, name: z.string().min(1).max(256) })
    .strict()
    .safeParse(pageInput);
  const observations = z
    .array(figmaComponentObservationSchema)
    .max(10_000)
    .safeParse(observationsInput);
  if (!plan.success || !page.success || !observations.success) {
    return failure(
      "VALIDATION_FAILED",
      "Figma component audit observations are invalid.",
      "Reload the current page with a compatible Hatchkit Plugin and retry.",
    );
  }
  const sources = new Map(
    plan.data.sources.map((source) => [source.componentSetStableId, source]),
  );
  const findings: FigmaComponentAuditFinding[] = [];
  let compliantInstances = 0;
  for (const observation of observations.data) {
    const nodeFindings: FigmaComponentAuditFinding[] = [];
    if (observation.source === null) {
      nodeFindings.push(
        finding(
          "DETACHED_OR_APPROXIMATE_COMPONENT",
          observation,
          { nodeType: observation.node.type },
          { nodeType: "INSTANCE" },
          "Replace the detached or approximate node with a real registered Figma Instance.",
        ),
      );
    } else {
      const source =
        observation.source.componentSetStableId === null
          ? undefined
          : sources.get(observation.source.componentSetStableId);
      if (source === undefined) {
        nodeFindings.push(
          finding(
            "UNREGISTERED_COMPONENT_SOURCE",
            observation,
            {
              componentSetStableId:
                observation.source.componentSetStableId ?? null,
            },
            { registeredComponentSourceRequired: true },
            "Replace this Instance with one from the active Component Registry.",
          ),
        );
      } else {
        const variant = source.variants.find(
          ({ stableId }) => stableId === observation.source?.componentStableId,
        );
        if (variant === undefined) {
          nodeFindings.push(
            finding(
              "UNREGISTERED_VARIANT",
              observation,
              { componentStableId: observation.source.componentStableId },
              {
                registeredVariantStableIds: source.variants.map(
                  ({ stableId }) => stableId,
                ),
              },
              "Select an approved Variant from the registered Component Set.",
            ),
          );
        } else if (
          Object.entries(variant.properties).some(
            ([name, value]) =>
              observation.source?.variantProperties[name] !== value,
          )
        ) {
          nodeFindings.push(
            finding(
              "VARIANT_PROPERTY_MISMATCH",
              observation,
              { variantProperties: observation.source.variantProperties },
              { variantProperties: variant.properties },
              "Restore the exact approved Variant property selections.",
            ),
          );
        }
      }
    }
    if (
      observation.managedInstance !== null &&
      (observation.managedInstance.phase !== "applied" ||
        observation.source === null ||
        observation.managedInstance.componentSetStableId !==
          observation.source.componentSetStableId ||
        observation.managedInstance.variantStableId !==
          observation.source.componentStableId)
    ) {
      nodeFindings.push(
        finding(
          "INSTANCE_PROVENANCE_MISMATCH",
          observation,
          { managedInstance: observation.managedInstance },
          {
            componentSetStableId:
              observation.source?.componentSetStableId ?? null,
            phase: "applied",
            variantStableId: observation.source?.componentStableId ?? null,
          },
          "Reinsert the Instance through the Registry-backed Agent workflow.",
        ),
      );
    }
    if (nodeFindings.length === 0) compliantInstances += 1;
    findings.push(...nodeFindings);
  }
  findings.sort((left, right) =>
    `${left.node.id}/${left.code}`.localeCompare(
      `${right.node.id}/${right.code}`,
    ),
  );
  const count = (code: FigmaComponentAuditFinding["code"]) =>
    findings.filter((candidate) => candidate.code === code).length;
  const result = figmaComponentAuditResultSchema.safeParse({
    findings,
    page: page.data,
    passed: findings.length === 0,
    schemaVersion: FIGMA_COMPONENT_AUDIT_SCHEMA_VERSION,
    scope: "current-page",
    summary: {
      auditedNodes: observations.data.length,
      compliantInstances,
      detachedOrApproximate: count("DETACHED_OR_APPROXIMATE_COMPONENT"),
      provenanceMismatches: count("INSTANCE_PROVENANCE_MISMATCH"),
      unregisteredSources: count("UNREGISTERED_COMPONENT_SOURCE"),
      unregisteredVariants: count("UNREGISTERED_VARIANT"),
      variantPropertyMismatches: count("VARIANT_PROPERTY_MISMATCH"),
    },
    type: "audit.components.scan",
  });
  return result.success
    ? createSuccessResult(result.data)
    : failure(
        "VALIDATION_FAILED",
        "The Figma component audit result exceeded its contract.",
        "Reduce the page scope or repair duplicate Plugin observations.",
      );
}
