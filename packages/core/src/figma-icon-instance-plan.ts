import * as z from "zod";

import { resolveComponent } from "./component-query.js";
import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import {
  ICON_CONTRACT_PROFILE,
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
import { semanticVersionMajor } from "./semantic-version.js";

export const FIGMA_ICON_INSTANCE_PLAN_SCHEMA_VERSION = "1.0.0" as const;

const nodeIdSchema = z
  .string()
  .max(128)
  .regex(/^\d+:\d+$/u);

export const figmaIconInstancePlanSchema = z
  .object({
    componentSet: z
      .object({
        expectedVariantStableIds: z.array(stableAssetIdSchema).length(3),
        majorVersion: z.number().int().nonnegative(),
        nodeId: nodeIdSchema,
        stableId: stableAssetIdSchema,
      })
      .strict(),
    instance: z
      .object({
        stableId: stableAssetIdSchema,
        x: z.number().finite().min(-1_000_000).max(1_000_000),
        y: z.number().finite().min(-1_000_000).max(1_000_000),
      })
      .strict(),
    properties: z
      .object({
        size: z
          .object({
            name: z.literal("Size"),
            value: z.enum(["Small", "Medium", "Large"]),
          })
          .strict(),
      })
      .strict(),
    schemaVersion: z.literal(FIGMA_ICON_INSTANCE_PLAN_SCHEMA_VERSION),
    selectedVariant: z
      .object({
        figmaName: z.string().min(1).max(120),
        selections: z
          .object({ size: z.enum(["small", "medium", "large"]) })
          .strict(),
        slotId: stableAssetIdSchema,
        stableId: stableAssetIdSchema,
      })
      .strict(),
    source: z
      .object({
        approvalId: z
          .string()
          .min(1)
          .max(320)
          .regex(/^approval\.component\.[a-z0-9.+-]+$/u),
        assetId: stableAssetIdSchema,
        assetVersion: strictSemverSchema,
        contentDigest: contentDigestSchema,
        fileBindingId: z.uuid(),
        projectId: stableIdSegmentSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, context) => {
    const root = `${plan.source.projectId}/component/${plan.source.assetId}/component-set/major-${semanticVersionMajor(plan.source.assetVersion)}`;
    if (
      plan.componentSet.stableId !== root ||
      String(plan.componentSet.majorVersion) !==
        semanticVersionMajor(plan.source.assetVersion)
    ) {
      context.addIssue({
        code: "custom",
        message: "Icon Component Set identity must match its source Major.",
        path: ["componentSet"],
      });
    }
    const expectedApproval = `approval.component.${plan.source.assetId.replaceAll("/", ".")}.${plan.source.assetVersion}`;
    if (plan.source.approvalId !== expectedApproval) {
      context.addIssue({
        code: "custom",
        message: `Approval ID must be '${expectedApproval}'.`,
        path: ["source", "approvalId"],
      });
    }
    if (
      plan.selectedVariant.stableId !==
        `${root}/${plan.selectedVariant.slotId}` ||
      plan.selectedVariant.figmaName !==
        `${plan.properties.size.name}=${plan.properties.size.value}`
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Selected Icon Variant must match its stable identity and Size.",
        path: ["selectedVariant"],
      });
    }
    if (
      !plan.instance.stableId.startsWith(`${plan.source.projectId}/instance/`)
    ) {
      context.addIssue({
        code: "custom",
        message: "Icon Instance identity must belong to its source project.",
        path: ["instance", "stableId"],
      });
    }
    if (
      new Set(plan.componentSet.expectedVariantStableIds).size !== 3 ||
      plan.componentSet.expectedVariantStableIds.some(
        (stableId) => !stableId.startsWith(`${root}/`),
      ) ||
      !plan.componentSet.expectedVariantStableIds.includes(
        plan.selectedVariant.stableId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Expected Icon Variants must be unique and belong to the Set.",
        path: ["componentSet", "expectedVariantStableIds"],
      });
    }
  });

export type FigmaIconInstancePlan = z.infer<typeof figmaIconInstancePlanSchema>;

export const figmaIconInstanceRequestSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.optional(),
  instanceId: stableAssetIdSchema,
  projectId: stableIdSegmentSchema,
  variantSelections: z
    .object({ size: z.enum(["small", "medium", "large"]) })
    .strict(),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export type FigmaIconInstanceRequest = z.infer<
  typeof figmaIconInstanceRequestSchema
>;

export function createFigmaIconInstancePlan(
  snapshot: DesignSystemSnapshot,
  requestInput: unknown,
): ToolkitResult<FigmaIconInstancePlan> {
  const request = figmaIconInstanceRequestSchema.safeParse(requestInput);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The Icon Instance request is invalid.",
        recoveryInstruction:
          "Provide a stable instance ID, exact Size and finite placement.",
        target: { logicalId: "icon-instance", type: "operation" },
      }),
    );
  }
  const resolved = resolveComponent(snapshot, {
    assetId: request.data.assetId,
    ...(request.data.assetVersion === undefined
      ? {}
      : { assetVersion: request.data.assetVersion }),
    projectId: request.data.projectId,
    variantSelections: request.data.variantSelections,
  });
  if (!resolved.ok) return resolved;
  if (resolved.data.status !== "figma-ready") {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_NOT_FOUND",
        message: "The requested Icon is not Ready in the Component Registry.",
        recoveryInstruction:
          "Ensure, visually approve and register the Main Component before inserting an Instance.",
        target: {
          logicalId: request.data.assetId,
          type: "component",
          version: resolved.data.contract.assetVersion,
        },
      }),
    );
  }
  const { contract, registryEntry, selectedVariant } = resolved.data;
  if (contract.profile !== ICON_CONTRACT_PROFILE) {
    return createFailureResult(
      createToolkitError({
        code: "IDENTITY_CONFLICT",
        message: "The Icon request resolved a non-Icon Component profile.",
        recoveryInstruction:
          "Repair the Registry and resolve the exact Icon Contract before planning insertion.",
        target: { logicalId: contract.assetId, type: "component" },
      }),
    );
  }
  const iconVariant =
    selectedVariant as IconComponentContract["variants"][number];
  const sizeProperty = contract.properties[0];
  const sizeValue = sizeProperty?.options.find(
    ({ id }) => id === iconVariant.selections.size,
  )?.figmaValue;
  if (sizeProperty?.kind !== "variant" || sizeValue === undefined) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message: "The selected Icon Size cannot be mapped to Figma.",
        recoveryInstruction: "Repair and revalidate the Icon Contract.",
        target: { logicalId: selectedVariant.id, type: "component" },
      }),
    );
  }
  const root = `${contract.projectId}/component/${contract.assetId}/component-set/major-${String(registryEntry.figma.majorVersion)}`;
  const plan = figmaIconInstancePlanSchema.safeParse({
    componentSet: {
      expectedVariantStableIds: contract.variants.map(
        ({ slotId }) => `${root}/${slotId}`,
      ),
      majorVersion: registryEntry.figma.majorVersion,
      nodeId: registryEntry.figma.locator.nodeId,
      stableId: root,
    },
    instance: {
      stableId: `${contract.projectId}/instance/${request.data.instanceId}`,
      x: request.data.x,
      y: request.data.y,
    },
    properties: {
      size: { name: sizeProperty.figmaName, value: sizeValue },
    },
    schemaVersion: FIGMA_ICON_INSTANCE_PLAN_SCHEMA_VERSION,
    selectedVariant: {
      figmaName: `${sizeProperty.figmaName}=${sizeValue}`,
      selections: { size: iconVariant.selections.size },
      slotId: selectedVariant.slotId,
      stableId: `${root}/${selectedVariant.slotId}`,
    },
    source: {
      approvalId: registryEntry.approvalId,
      assetId: contract.assetId,
      assetVersion: contract.assetVersion,
      contentDigest: registryEntry.asset.contentDigest,
      fileBindingId: registryEntry.figma.fileBindingId,
      projectId: contract.projectId,
    },
  });
  return plan.success
    ? createSuccessResult(plan.data)
    : createFailureResult(
        createToolkitError({
          code: "INTERNAL_ERROR",
          message:
            "The verified Icon resolution could not produce an Instance plan.",
          recoveryInstruction: "Reload and validate the design system.",
          target: { logicalId: contract.assetId, type: "component" },
        }),
      );
}
