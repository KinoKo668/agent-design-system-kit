import * as z from "zod";

import { resolveComponent } from "./component-query.js";
import type { DesignSystemSnapshot } from "./design-system-snapshot.js";
import { createToolkitError } from "./errors.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import {
  contentDigestSchema,
  stableAssetIdSchema,
  stableIdSegmentSchema,
  strictSemverSchema,
} from "./schema-primitives.js";
import { semanticVersionMajor } from "./semantic-version.js";

export const FIGMA_BUTTON_INSTANCE_PLAN_SCHEMA_VERSION = "1.0.0" as const;

const nodeIdSchema = z
  .string()
  .max(128)
  .regex(/^\d+:\d+$/u);
const propertySchema = z
  .object({
    name: z.string().min(1).max(120),
    value: z.string().min(1).max(500),
  })
  .strict();

export const figmaButtonInstancePlanSchema = z
  .object({
    componentSet: z
      .object({
        expectedVariantStableIds: z.array(stableAssetIdSchema).length(4),
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
        appearance: propertySchema,
        label: propertySchema,
        state: propertySchema,
      })
      .strict(),
    schemaVersion: z.literal(FIGMA_BUTTON_INSTANCE_PLAN_SCHEMA_VERSION),
    selectedVariant: z
      .object({
        figmaName: z.string().min(1).max(240),
        selections: z
          .object({
            appearance: stableIdSegmentSchema,
            state: stableIdSegmentSchema,
          })
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
        message:
          "Component Set identity must match the source Component Major.",
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
      plan.selectedVariant.stableId !== `${root}/${plan.selectedVariant.slotId}`
    ) {
      context.addIssue({
        code: "custom",
        message: "Selected Variant identity must belong to the Component Set.",
        path: ["selectedVariant", "stableId"],
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
    if (new Set(plan.componentSet.expectedVariantStableIds).size !== 4) {
      context.addIssue({
        code: "custom",
        message: "Expected Variant identities must be unique.",
        path: ["componentSet", "expectedVariantStableIds"],
      });
    }
    if (
      plan.componentSet.expectedVariantStableIds.some(
        (stableId) => !stableId.startsWith(`${root}/`),
      ) ||
      !plan.componentSet.expectedVariantStableIds.includes(
        plan.selectedVariant.stableId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Every expected Variant must belong to the Component Set and include the selected Variant.",
        path: ["componentSet", "expectedVariantStableIds"],
      });
    }
    const expectedFigmaName = `${plan.properties.appearance.name}=${plan.properties.appearance.value}, ${plan.properties.state.name}=${plan.properties.state.value}`;
    if (plan.selectedVariant.figmaName !== expectedFigmaName) {
      context.addIssue({
        code: "custom",
        message:
          "Selected Variant Figma name must match the requested properties.",
        path: ["selectedVariant", "figmaName"],
      });
    }
    if (plan.properties.label.value.trim() !== plan.properties.label.value) {
      context.addIssue({
        code: "custom",
        message: "Label must not start or end with whitespace.",
        path: ["properties", "label", "value"],
      });
    }
  });

export type FigmaButtonInstancePlan = z.infer<
  typeof figmaButtonInstancePlanSchema
>;

export const figmaButtonInstanceRequestSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema.optional(),
  instanceId: stableAssetIdSchema,
  label: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => value.trim() === value, {
      message: "Label must not start or end with whitespace.",
    }),
  projectId: stableIdSegmentSchema,
  variantSelections: z.record(stableIdSegmentSchema, stableIdSegmentSchema),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export type FigmaButtonInstanceRequest = z.infer<
  typeof figmaButtonInstanceRequestSchema
>;

export function createFigmaButtonInstancePlan(
  snapshot: DesignSystemSnapshot,
  requestInput: unknown,
): ToolkitResult<FigmaButtonInstancePlan> {
  const request = figmaButtonInstanceRequestSchema.safeParse(requestInput);
  if (!request.success) {
    return createFailureResult(
      createToolkitError({
        code: "VALIDATION_FAILED",
        message: "The Button Instance request is invalid.",
        recoveryInstruction:
          "Provide a stable instance ID, exact Variant selections, a bounded label and finite placement.",
        target: { logicalId: "button-instance", type: "operation" },
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
        message: "The requested Button is not Ready in the Component Registry.",
        recoveryInstruction:
          "Ensure and register the approved Main Component before inserting an Instance.",
        target: {
          logicalId: request.data.assetId,
          type: "component",
          version: resolved.data.contract.assetVersion,
        },
      }),
    );
  }
  const { contract, registryEntry, selectedVariant } = resolved.data;
  const property = (id: string) =>
    contract.properties.find((candidate) => candidate.id === id);
  const appearance = property("appearance");
  const state = property("state");
  const label = property("label");
  if (
    appearance?.kind !== "variant" ||
    state?.kind !== "variant" ||
    label?.kind !== "text"
  ) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message: "The verified Button Contract lacks its required properties.",
        recoveryInstruction: "Repair and revalidate the Button Contract.",
        target: { logicalId: contract.assetId, type: "component" },
      }),
    );
  }
  const appearanceValue = appearance.options.find(
    ({ id }) => id === selectedVariant.selections.appearance,
  )?.figmaValue;
  const stateValue = state.options.find(
    ({ id }) => id === selectedVariant.selections.state,
  )?.figmaValue;
  if (appearanceValue === undefined || stateValue === undefined) {
    return createFailureResult(
      createToolkitError({
        code: "INTERNAL_ERROR",
        message:
          "The selected Button Variant cannot be mapped to Figma values.",
        recoveryInstruction: "Repair and revalidate the Button Contract.",
        target: { logicalId: selectedVariant.id, type: "component" },
      }),
    );
  }
  const root = `${contract.projectId}/component/${contract.assetId}/component-set/major-${String(registryEntry.figma.majorVersion)}`;
  const plan = figmaButtonInstancePlanSchema.safeParse({
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
      appearance: { name: appearance.figmaName, value: appearanceValue },
      label: { name: label.figmaName, value: request.data.label },
      state: { name: state.figmaName, value: stateValue },
    },
    schemaVersion: FIGMA_BUTTON_INSTANCE_PLAN_SCHEMA_VERSION,
    selectedVariant: {
      figmaName: `${appearance.figmaName}=${appearanceValue}, ${state.figmaName}=${stateValue}`,
      selections: {
        appearance: selectedVariant.selections.appearance,
        state: selectedVariant.selections.state,
      },
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
            "The verified Button resolution could not produce an Instance plan.",
          recoveryInstruction: "Reload and validate the design system.",
          target: { logicalId: contract.assetId, type: "component" },
        }),
      );
}
