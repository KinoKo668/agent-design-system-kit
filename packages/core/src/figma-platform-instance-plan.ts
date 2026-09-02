import * as z from "zod";

import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import { resolvePlatformComponent } from "./platform-component-query.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";

export const FIGMA_PLATFORM_INSTANCE_PLAN_SCHEMA_VERSION = "1.0.0" as const;

const figmaKeySchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/^[a-z0-9_-]+$/iu);
const boundedValueSchema = z
  .string()
  .min(1)
  .max(1_000)
  .refine((value) => value.trim() === value, {
    message: "Must not start or end with whitespace.",
  });

export const figmaPlatformInstancePlanSchema = z
  .strictObject({
    constraints: z.strictObject({
      allowComponentMutation: z.literal(false),
      allowDetach: z.literal(false),
      allowFallback: z.literal(false),
      requireRemote: z.literal(true),
    }),
    instance: z.strictObject({
      stableId: stableAssetIdSchema,
      x: z.number().finite().min(-1_000_000).max(1_000_000),
      y: z.number().finite().min(-1_000_000).max(1_000_000),
    }),
    propertyOverrides: z.array(
      z.strictObject({
        contractPropertyId: stableAssetIdSchema,
        figmaPropertyName: z.string().min(1).max(240),
        value: boundedValueSchema,
      }),
    ),
    schemaVersion: z.literal(FIGMA_PLATFORM_INSTANCE_PLAN_SCHEMA_VERSION),
    selectedVariantId: stableAssetIdSchema,
    source: z.strictObject({
      approvalId: z
        .string()
        .min(1)
        .max(320)
        .regex(/^approval\.platform-binding\.[a-z0-9.+-]+$/u),
      bindingId: stableAssetIdSchema,
      bindingVersion: strictSemverSchema,
      componentContentDigest: contentDigestSchema,
      componentId: stableAssetIdSchema,
      componentKey: figmaKeySchema,
      componentVersion: strictSemverSchema,
      contentDigest: contentDigestSchema,
      fileBindingId: z.uuid(),
      libraryId: stableAssetIdSchema,
      libraryKey: figmaKeySchema,
      platformTargetContentDigest: contentDigestSchema,
      platformTargetId: stableAssetIdSchema,
      platformTargetVersion: strictSemverSchema,
      projectId: stableIdSegmentSchema,
      vendor: z.enum(["apple", "google"]),
      verifiedAt: z.iso.datetime({ offset: true }),
    }),
  })
  .superRefine((plan, context) => {
    const expectedApproval = `approval.platform-binding.${plan.source.bindingId.replaceAll("/", ".")}.${plan.source.bindingVersion}`;
    if (plan.source.approvalId !== expectedApproval) {
      context.addIssue({
        code: "custom",
        message: `Approval ID must be '${expectedApproval}'.`,
        path: ["source", "approvalId"],
      });
    }
    if (
      !plan.instance.stableId.startsWith(`${plan.source.projectId}/instance/`)
    ) {
      context.addIssue({
        code: "custom",
        message: "Instance identity must belong to the source project.",
        path: ["instance", "stableId"],
      });
    }
    const properties = new Set<string>();
    plan.propertyOverrides.forEach((property, index) => {
      if (properties.has(property.contractPropertyId)) {
        context.addIssue({
          code: "custom",
          message: `Property '${property.contractPropertyId}' is overridden more than once.`,
          path: ["propertyOverrides", index, "contractPropertyId"],
        });
      }
      properties.add(property.contractPropertyId);
    });
  });

export type FigmaPlatformInstancePlan = z.infer<
  typeof figmaPlatformInstancePlanSchema
>;

export const figmaPlatformInstanceRequestSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.optional(),
  fileBindingId: z.uuid(),
  instanceId: stableAssetIdSchema,
  platformTargetId: stableAssetIdSchema,
  platformTargetVersion: strictSemverSchema,
  projectId: stableIdSegmentSchema,
  propertyValues: z.record(stableAssetIdSchema, boundedValueSchema).default({}),
  variantSelections: z.record(stableIdSegmentSchema, stableIdSegmentSchema),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export function createFigmaPlatformInstancePlan(
  snapshot: DesignSystemSnapshot,
  requestInput: unknown,
): ToolkitResult<FigmaPlatformInstancePlan> {
  const request = figmaPlatformInstanceRequestSchema.safeParse(requestInput);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The official Platform Instance request is invalid.",
        recoveryInstruction:
          "Provide an exact Platform Target, Component Variant, approved property values, file binding, stable instance ID and finite placement.",
        target: { logicalId: "platform-instance", type: "operation" },
      }),
    );
  }
  const resolved = resolvePlatformComponent(snapshot, {
    assetId: request.data.assetId,
    assetVersion: request.data.assetVersion,
    platformTargetId: request.data.platformTargetId,
    platformTargetVersion: request.data.platformTargetVersion,
    projectId: request.data.projectId,
    variantSelections: request.data.variantSelections,
  });
  if (!resolved.ok) return resolved;
  if (resolved.data.status !== "official-library-ready") {
    return createFailureResult(
      createToolkitError({
        code: "APPROVAL_REQUIRED",
        message:
          "The exact official platform component is not ready for insertion.",
        recoveryInstruction:
          "Verify the official Library keys and obtain human approval for the exact platform binding.",
        target: {
          logicalId: request.data.assetId,
          type: "platform-binding",
        },
      }),
    );
  }
  const { componentResolution, platformRegistryEntry, platformTarget } =
    resolved.data;
  if (platformRegistryEntry.review.status !== "approved") {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message: "A ready official binding has no approved review identity.",
        recoveryInstruction:
          "Reload and validate the Platform Component Registry before retrying.",
        target: {
          logicalId: platformRegistryEntry.bindingId,
          type: "platform-binding",
          version: platformRegistryEntry.bindingVersion,
        },
      }),
    );
  }
  const propertyMappings = new Map(
    platformRegistryEntry.figma.propertyMappings.map((mapping) => [
      mapping.contractPropertyId,
      mapping,
    ]),
  );
  const propertyOverrides: FigmaPlatformInstancePlan["propertyOverrides"] = [];
  for (const [contractPropertyId, value] of Object.entries(
    request.data.propertyValues,
  )) {
    const mapping = propertyMappings.get(contractPropertyId);
    if (mapping === undefined || mapping.support !== "writable") {
      return createFailureResult(
        createToolkitError({
          code: "VALIDATION_FAILED",
          context: {
            details: {
              contractPropertyId,
              reason:
                mapping === undefined ? "not-mapped" : "declared-unsupported",
            },
          },
          message: `Official component property '${contractPropertyId}' is not approved for modification.`,
          recoveryInstruction:
            "Use only writable property mappings from the approved Platform Component Registry entry.",
          target: {
            logicalId: platformRegistryEntry.bindingId,
            type: "platform-binding",
            version: platformRegistryEntry.bindingVersion,
          },
        }),
      );
    }
    propertyOverrides.push({
      contractPropertyId,
      figmaPropertyName: mapping.figmaPropertyName,
      value,
    });
  }
  propertyOverrides.sort((left, right) =>
    left.contractPropertyId.localeCompare(right.contractPropertyId),
  );
  return createSuccessResult({
    constraints: {
      allowComponentMutation: false,
      allowDetach: false,
      allowFallback: false,
      requireRemote: true,
    },
    instance: {
      stableId: `${request.data.projectId}/instance/${request.data.instanceId}`,
      x: request.data.x,
      y: request.data.y,
    },
    propertyOverrides,
    schemaVersion: FIGMA_PLATFORM_INSTANCE_PLAN_SCHEMA_VERSION,
    selectedVariantId: componentResolution.selectedVariant.id,
    source: {
      approvalId: platformRegistryEntry.review.approvalId,
      bindingId: platformRegistryEntry.bindingId,
      bindingVersion: platformRegistryEntry.bindingVersion,
      componentContentDigest: platformRegistryEntry.component.contentDigest,
      componentId: componentResolution.contract.assetId,
      componentKey: resolved.data.componentKey,
      componentVersion: componentResolution.contract.assetVersion,
      contentDigest: platformRegistryEntry.contentDigest,
      fileBindingId: request.data.fileBindingId,
      libraryId: platformRegistryEntry.source.libraryId,
      libraryKey: resolved.data.libraryKey,
      platformTargetContentDigest:
        platformRegistryEntry.platformTarget.contentDigest,
      platformTargetId: platformTarget.assetId,
      platformTargetVersion: platformTarget.assetVersion,
      projectId: request.data.projectId,
      vendor: platformRegistryEntry.source.vendor,
      verifiedAt: platformRegistryEntry.figma.verifiedAt,
    },
  });
}
