import * as z from "zod";

import { createToolkitError } from "./errors.js";
import type { ComponentContract } from "./component-contract.js";
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

export const PLATFORM_TARGET_SCHEMA_VERSION = "1.0.0" as const;
export const PLATFORM_TARGET_ASSET_TYPE = "platform-target" as const;
export const PLATFORM_COMPONENT_REGISTRY_SCHEMA_VERSION = "1.0.0" as const;
export const PLATFORM_COMPONENT_REGISTRY_TYPE =
  "platform-component-registry" as const;

export const NATIVE_PLATFORMS = ["android", "ios", "ipados"] as const;
export const PLATFORM_RELEASE_CHANNELS = ["preview", "stable"] as const;
export const NATIVE_FIDELITY_MODES = ["adapted", "branded", "strict"] as const;
export const IMPLEMENTATION_FRAMEWORKS = [
  "android-views",
  "compose",
  "swiftui",
  "uikit",
] as const;
export const OFFICIAL_LIBRARY_VENDORS = ["apple", "google"] as const;
export const PLATFORM_COMPONENT_RESOLUTION_PRIORITY = [
  "platform-system",
  "official-vendor",
  "brand-wrapper",
  "hatchkit-managed",
  "change-request",
] as const;

const requiredText = (maximum: number): z.ZodString =>
  z
    .string()
    .min(1, "Must not be empty.")
    .max(maximum, `Must contain at most ${String(maximum)} characters.`)
    .refine((value) => value.trim() === value, {
      message: "Must not start or end with whitespace.",
    });

const officialSourceUrlSchema = z
  .url("Must be an absolute URL.")
  .refine((value) => value.startsWith("https://"), {
    message: "Must use HTTPS.",
  });

function httpsHostname(value: string): string | undefined {
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/iu.exec(value);
  return match?.[1]?.toLowerCase();
}

const figmaCommunityUrlSchema = z
  .url("Must be an absolute Figma Community URL.")
  .refine((value) => {
    return (
      ["figma.com", "www.figma.com"].includes(httpsHostname(value) ?? "") &&
      /^https:\/\/(?:www\.)?figma\.com\/community\//iu.test(value)
    );
  }, "Must be an HTTPS figma.com/community URL.");

const isoTimestampSchema = z.iso.datetime({ offset: true });
const platformSchema = z.enum(NATIVE_PLATFORMS);
const releaseChannelSchema = z.enum(PLATFORM_RELEASE_CHANNELS);
const vendorSchema = z.enum(OFFICIAL_LIBRARY_VENDORS);

const libraryVerificationSchema = z
  .strictObject({
    evidence: requiredText(1_000).optional(),
    status: z.enum(["figma-verified", "metadata-verified", "planned"]),
    verifiedAt: isoTimestampSchema.optional(),
  })
  .superRefine((verification, context) => {
    if (
      verification.status === "figma-verified" &&
      (verification.verifiedAt === undefined ||
        verification.evidence === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Figma-verified libraries require verifiedAt and human-readable evidence.",
        path: ["verifiedAt"],
      });
    }
    if (
      verification.status === "planned" &&
      (verification.verifiedAt !== undefined ||
        verification.evidence !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Planned libraries must not claim verification evidence.",
        path: ["status"],
      });
    }
  });

export const officialLibraryBindingSchema = z
  .strictObject({
    enablement: z.literal("user-must-enable"),
    figmaCommunityUrl: figmaCommunityUrlSchema.optional(),
    kitName: requiredText(160),
    kitVersion: requiredText(80),
    libraryId: stableAssetIdSchema,
    official: z.literal(true),
    officialSourceUrl: officialSourceUrlSchema,
    publisher: requiredText(120),
    redistribution: z.literal("external-reference-only"),
    releaseChannel: releaseChannelSchema,
    supportedPlatforms: z.array(platformSchema).min(1).max(3),
    vendor: vendorSchema,
    verification: libraryVerificationSchema,
  })
  .superRefine((library, context) => {
    const officialHost = httpsHostname(library.officialSourceUrl);
    const allowedHosts =
      library.vendor === "apple"
        ? ["developer.apple.com"]
        : ["developer.android.com", "m3.material.io"];
    if (!allowedHosts.includes(officialHost ?? "")) {
      context.addIssue({
        code: "custom",
        message: `${library.vendor} officialSourceUrl must use an approved first-party domain.`,
        path: ["officialSourceUrl"],
      });
    }
    const allowedPlatforms =
      library.vendor === "apple"
        ? new Set(["ios", "ipados"])
        : new Set(["android"]);
    library.supportedPlatforms.forEach((platform, index) => {
      if (!allowedPlatforms.has(platform)) {
        context.addIssue({
          code: "custom",
          message: `${library.vendor} cannot be registered as an official source for '${platform}'.`,
          path: ["supportedPlatforms", index],
        });
      }
    });
    const seen = new Set<string>();
    library.supportedPlatforms.forEach((platform, index) => {
      if (seen.has(platform)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate supported platform '${platform}'.`,
          path: ["supportedPlatforms", index],
        });
      }
      seen.add(platform);
    });
  });

export const platformTargetSchema = z
  .strictObject({
    assetId: stableAssetIdSchema,
    assetType: z.literal(PLATFORM_TARGET_ASSET_TYPE),
    assetVersion: strictSemverSchema,
    contentDigest: contentDigestSchema.optional(),
    formFactor: z.enum(["foldable", "phone", "tablet"]),
    implementationFramework: z.enum(IMPLEMENTATION_FRAMEWORKS),
    libraryBindings: z.array(officialLibraryBindingSchema).min(1).max(8),
    name: requiredText(120),
    nativeFidelity: z.enum(NATIVE_FIDELITY_MODES),
    osVersion: z
      .string()
      .regex(/^\d+(?:\.\d+){0,2}$/u, "Must be a numeric OS version."),
    platform: platformSchema,
    projectId: stableIdSegmentSchema,
    releaseChannel: releaseChannelSchema,
    resolutionPolicy: z.strictObject({
      allowCrossPlatformFallback: z.literal(false),
      allowDetachedInstances: z.literal(false),
      missingComponentAction: z.literal("change-request"),
      priority: z.tuple([
        z.literal("platform-system"),
        z.literal("official-vendor"),
        z.literal("brand-wrapper"),
        z.literal("hatchkit-managed"),
        z.literal("change-request"),
      ]),
      requireExactVersion: z.literal(true),
    }),
    schemaVersion: z.literal(PLATFORM_TARGET_SCHEMA_VERSION),
  })
  .superRefine((target, context) => {
    const appleFramework = ["swiftui", "uikit"].includes(
      target.implementationFramework,
    );
    if ((target.platform === "android") === appleFramework) {
      context.addIssue({
        code: "custom",
        message:
          "SwiftUI/UIKit are Apple frameworks; Android targets require Compose or Android Views.",
        path: ["implementationFramework"],
      });
    }
    if (
      target.releaseChannel === "stable" &&
      target.libraryBindings.some(
        (library) => library.releaseChannel === "preview",
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "A stable target must not depend on a preview UI kit.",
        path: ["libraryBindings"],
      });
    }
    const seen = new Set<string>();
    target.libraryBindings.forEach((library, index) => {
      if (seen.has(library.libraryId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate official library '${library.libraryId}'.`,
          path: ["libraryBindings", index, "libraryId"],
        });
      }
      seen.add(library.libraryId);
      if (!library.supportedPlatforms.includes(target.platform)) {
        context.addIssue({
          code: "custom",
          message: `Official library '${library.libraryId}' does not support target platform '${target.platform}'.`,
          path: ["libraryBindings", index, "supportedPlatforms"],
        });
      }
    });
  });

export type PlatformTarget = z.infer<typeof platformTargetSchema>;
export type OfficialLibraryBinding = z.infer<
  typeof officialLibraryBindingSchema
>;
export type PlatformTargetValidationIssue = SchemaValidationIssue;
export type PlatformTargetDigestSubject = Omit<PlatformTarget, "contentDigest">;

const figmaKeySchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/^[a-z0-9_-]+$/iu, "Must be a published Figma asset key.");

const platformTargetReferenceSchema = z.strictObject({
  assetId: stableAssetIdSchema,
  assetVersion: strictSemverSchema,
  contentDigest: contentDigestSchema,
});

const registeredComponentReferenceSchema = z.strictObject({
  contentDigest: contentDigestSchema,
  id: stableAssetIdSchema,
  version: strictSemverSchema,
});

const platformMappingReviewSchema = z.discriminatedUnion("status", [
  z.strictObject({ approvalId: z.null(), status: z.literal("unreviewed") }),
  z.strictObject({
    approvalId: z
      .string()
      .regex(
        /^approval\.platform-binding\.[a-z0-9.-]+$/u,
        "Must be a platform-binding Approval ID.",
      ),
    status: z.literal("approved"),
  }),
]);

const vendorSourceSchema = z.strictObject({
  kind: z.literal("vendor-library"),
  libraryId: stableAssetIdSchema,
  official: z.literal(true),
  redistribution: z.literal("external-reference-only"),
  vendor: vendorSchema,
});

const catalogedVendorFigmaBindingSchema = z.strictObject({
  status: z.literal("cataloged"),
});

const vendorPropertyMappingSchema = z.discriminatedUnion("support", [
  z.strictObject({
    contractPropertyId: stableAssetIdSchema,
    figmaPropertyName: requiredText(240),
    figmaPropertyType: z.literal("TEXT"),
    support: z.literal("writable"),
  }),
  z.strictObject({
    contractPropertyId: stableAssetIdSchema,
    reason: requiredText(1_000),
    support: z.literal("unsupported"),
  }),
]);

const readyVendorFigmaBindingSchema = z
  .strictObject({
    libraryKey: figmaKeySchema,
    mappings: z
      .array(
        z.strictObject({
          componentKey: figmaKeySchema,
          componentName: requiredText(240),
          variantId: stableAssetIdSchema,
        }),
      )
      .min(1)
      .max(256),
    propertyMappings: z.array(vendorPropertyMappingSchema).max(64),
    status: z.literal("ready"),
    verifiedAt: isoTimestampSchema,
  })
  .superRefine((binding, context) => {
    const variants = new Set<string>();
    const componentKeys = new Set<string>();
    const propertyIds = new Set<string>();
    binding.mappings.forEach((mapping, index) => {
      if (variants.has(mapping.variantId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate Variant mapping '${mapping.variantId}'.`,
          path: ["mappings", index, "variantId"],
        });
      }
      variants.add(mapping.variantId);
      if (componentKeys.has(mapping.componentKey)) {
        context.addIssue({
          code: "custom",
          message: `Published Component key is mapped more than once.`,
          path: ["mappings", index, "componentKey"],
        });
      }
      componentKeys.add(mapping.componentKey);
    });
    binding.propertyMappings.forEach((mapping, index) => {
      if (propertyIds.has(mapping.contractPropertyId)) {
        context.addIssue({
          code: "custom",
          message: `Contract property '${mapping.contractPropertyId}' is mapped more than once.`,
          path: ["propertyMappings", index, "contractPropertyId"],
        });
      }
      propertyIds.add(mapping.contractPropertyId);
    });
  });

export const vendorFigmaBindingSchema = z.discriminatedUnion("status", [
  catalogedVendorFigmaBindingSchema,
  readyVendorFigmaBindingSchema,
]);

export const platformComponentRegistryEntrySchema = z.strictObject({
  bindingId: stableAssetIdSchema,
  bindingVersion: strictSemverSchema,
  component: registeredComponentReferenceSchema,
  contentDigest: contentDigestSchema,
  figma: vendorFigmaBindingSchema,
  lifecycle: z.enum(["active", "revoked", "superseded"]),
  lifecycleReason: requiredText(1_000).nullable(),
  platformTarget: platformTargetReferenceSchema,
  review: platformMappingReviewSchema,
  source: vendorSourceSchema,
});

export const platformComponentRegistrySchema = z
  .strictObject({
    entries: z.array(platformComponentRegistryEntrySchema).min(1).max(5_000),
    projectId: stableIdSegmentSchema,
    registryType: z.literal(PLATFORM_COMPONENT_REGISTRY_TYPE),
    schemaVersion: z.literal(PLATFORM_COMPONENT_REGISTRY_SCHEMA_VERSION),
  })
  .superRefine((registry, context) => {
    const active = new Map<string, number>();
    registry.entries.forEach((entry, index) => {
      if (entry.lifecycle === "active") {
        const key = `${entry.component.id}@${entry.platformTarget.assetId}`;
        const previous = active.get(key);
        if (previous !== undefined) {
          context.addIssue({
            code: "custom",
            message: `Platform binding '${key}' already has an active entry at entries[${String(previous)}].`,
            path: ["entries", index, "lifecycle"],
          });
        }
        active.set(key, index);
        if (entry.lifecycleReason !== null) {
          context.addIssue({
            code: "custom",
            message:
              "An active platform binding must not have a lifecycle reason.",
            path: ["entries", index, "lifecycleReason"],
          });
        }
      } else if (entry.lifecycleReason === null) {
        context.addIssue({
          code: "custom",
          message:
            "An inactive platform binding must explain why it is inactive.",
          path: ["entries", index, "lifecycleReason"],
        });
      }
      if (
        entry.figma.status === "ready" &&
        entry.review.status !== "approved"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "A ready vendor mapping requires an approved platform-binding review.",
          path: ["entries", index, "review"],
        });
      }
      if (entry.review.status === "approved") {
        const expectedApprovalId = `approval.platform-binding.${entry.bindingId.replaceAll("/", ".")}.${entry.bindingVersion}`;
        if (entry.review.approvalId !== expectedApprovalId) {
          context.addIssue({
            code: "custom",
            message: `Platform binding Approval ID must be '${expectedApprovalId}'.`,
            path: ["entries", index, "review", "approvalId"],
          });
        }
      }
    });
  });

export type PlatformComponentRegistry = z.infer<
  typeof platformComponentRegistrySchema
>;
export type PlatformComponentRegistryEntry = z.infer<
  typeof platformComponentRegistryEntrySchema
>;
export type PlatformBindingDigestSubject = Omit<
  PlatformComponentRegistryEntry,
  "contentDigest" | "lifecycle" | "lifecycleReason" | "review"
>;

export function toPlatformBindingDigestSubject(
  entry: PlatformComponentRegistryEntry,
): PlatformBindingDigestSubject {
  const {
    contentDigest: _contentDigest,
    lifecycle: _lifecycle,
    lifecycleReason: _lifecycleReason,
    review: _review,
    ...subject
  } = entry;
  void _contentDigest;
  void _lifecycle;
  void _lifecycleReason;
  void _review;
  return subject;
}

function validationFailure(
  target: string,
  label: string,
  issues: readonly SchemaValidationIssue[],
): ReturnType<typeof createFailureResult> {
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `${label} contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Correct the fields listed in context.details.issues and validate again.",
      target: { logicalId: target, type: "registry" },
    }),
  );
}

export function validatePlatformTarget(
  input: unknown,
): ToolkitResult<PlatformTarget> {
  const provided = getProvidedSchemaVersion(input);
  if (
    provided !== undefined &&
    provided.schemaVersion !== PLATFORM_TARGET_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: provided,
          expected: { schemaVersion: PLATFORM_TARGET_SCHEMA_VERSION },
        },
        message: "The Platform Target schema version is not supported.",
        recoveryInstruction:
          "Use Platform Target schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "platform-target-schema",
          type: "schema",
          version: provided.schemaVersion,
        },
      }),
    );
  }
  const result = platformTargetSchema.safeParse(input);
  return result.success
    ? createSuccessResult(result.data)
    : validationFailure(
        "platform-target",
        "The Platform Target",
        toValidationIssues(result.error),
      );
}

export function validatePlatformComponentRegistry(
  input: unknown,
): ToolkitResult<PlatformComponentRegistry> {
  const provided = getProvidedSchemaVersion(input);
  if (
    provided !== undefined &&
    provided.schemaVersion !== PLATFORM_COMPONENT_REGISTRY_SCHEMA_VERSION
  ) {
    return createFailureResult(
      createToolkitError({
        code: "SCHEMA_VERSION_UNSUPPORTED",
        context: {
          actual: provided,
          expected: {
            schemaVersion: PLATFORM_COMPONENT_REGISTRY_SCHEMA_VERSION,
          },
        },
        message:
          "The Platform Component Registry schema version is not supported.",
        recoveryInstruction:
          "Use Platform Component Registry schema version 1.0.0 or run a registered migration.",
        target: {
          logicalId: "platform-component-registry-schema",
          type: "schema",
          version: provided.schemaVersion,
        },
      }),
    );
  }
  const result = platformComponentRegistrySchema.safeParse(input);
  return result.success
    ? createSuccessResult(result.data)
    : validationFailure(
        "platform-component-registry",
        "The Platform Component Registry",
        toValidationIssues(result.error),
      );
}

export function toPlatformTargetDigestSubject(
  target: PlatformTarget,
): PlatformTargetDigestSubject {
  const { contentDigest: _contentDigest, ...subject } = target;
  void _contentDigest;
  return subject;
}

export function validatePlatformComponentRegistryWithAssets(
  registry: PlatformComponentRegistry,
  targets: readonly PlatformTarget[],
  components: readonly ComponentContract[],
): ToolkitResult<PlatformComponentRegistry> {
  const issues: SchemaValidationIssue[] = [];
  const targetsByIdentity = new Map(
    targets.map((target) => [
      `${target.projectId}/platform-target/${target.assetId}@${target.assetVersion}`,
      target,
    ]),
  );
  const componentsByIdentity = new Map(
    components.map((component) => [
      `${component.projectId}/component/${component.assetId}@${component.assetVersion}`,
      component,
    ]),
  );
  registry.entries.forEach((entry, index) => {
    const targetKey = `${registry.projectId}/platform-target/${entry.platformTarget.assetId}@${entry.platformTarget.assetVersion}`;
    const target = targetsByIdentity.get(targetKey);
    if (target === undefined) {
      issues.push({
        code: "custom",
        message: `Platform Target '${targetKey}' was not loaded.`,
        path: `/entries/${String(index)}/platformTarget`,
      });
      return;
    }
    if (
      entry.platformTarget.assetId !== target.assetId ||
      entry.platformTarget.assetVersion !== target.assetVersion ||
      target.contentDigest === undefined ||
      entry.platformTarget.contentDigest !== target.contentDigest
    ) {
      issues.push({
        code: "custom",
        message: "Platform Target reference does not match the loaded target.",
        path: `/entries/${String(index)}/platformTarget`,
      });
    }
    const componentKey = `${registry.projectId}/component/${entry.component.id}@${entry.component.version}`;
    const component = componentsByIdentity.get(componentKey);
    if (component === undefined) {
      issues.push({
        code: "custom",
        message: `Component Contract '${componentKey}' was not loaded.`,
        path: `/entries/${String(index)}/component`,
      });
      return;
    }
    if (
      entry.component.id !== component.assetId ||
      entry.component.version !== component.assetVersion ||
      component.contentDigest === undefined ||
      entry.component.contentDigest !== component.contentDigest
    ) {
      issues.push({
        code: "custom",
        message: "Component reference does not match the loaded Contract.",
        path: `/entries/${String(index)}/component`,
      });
    }
    const library = target.libraryBindings.find(
      (candidate) => candidate.libraryId === entry.source.libraryId,
    );
    if (
      library === undefined ||
      library.vendor !== entry.source.vendor ||
      !library.supportedPlatforms.includes(target.platform)
    ) {
      issues.push({
        code: "custom",
        message:
          "Vendor source must reference an official library bound to the Platform Target.",
        path: `/entries/${String(index)}/source`,
      });
    }
    if (entry.figma.status === "ready") {
      const contractVariants = new Set(
        component.variants.map((variant) => variant.id),
      );
      const mappedVariants = new Set(
        entry.figma.mappings.map((mapping) => mapping.variantId),
      );
      for (const variantId of contractVariants) {
        if (!mappedVariants.has(variantId)) {
          issues.push({
            code: "custom",
            message: `Ready vendor binding is missing Variant '${variantId}'.`,
            path: `/entries/${String(index)}/figma/mappings`,
          });
        }
      }
      for (const variantId of mappedVariants) {
        if (!contractVariants.has(variantId)) {
          issues.push({
            code: "custom",
            message: `Vendor binding maps unknown Variant '${variantId}'.`,
            path: `/entries/${String(index)}/figma/mappings`,
          });
        }
      }
      const contractTextProperties = component.properties.filter(
        (property) => property.kind === "text",
      );
      const mappedPropertyIds = new Set(
        entry.figma.propertyMappings.map(
          (mapping) => mapping.contractPropertyId,
        ),
      );
      for (const property of contractTextProperties) {
        if (!mappedPropertyIds.has(property.id)) {
          issues.push({
            code: "custom",
            message: `Ready vendor binding is missing text property '${property.id}'.`,
            path: `/entries/${String(index)}/figma/propertyMappings`,
          });
        }
        const mapping = entry.figma.propertyMappings.find(
          (candidate) => candidate.contractPropertyId === property.id,
        );
        const required = "required" in property ? property.required : true;
        if (required && mapping?.support === "unsupported") {
          issues.push({
            code: "custom",
            message: `Required text property '${property.id}' cannot be unsupported.`,
            path: `/entries/${String(index)}/figma/propertyMappings`,
          });
        }
      }
      for (const propertyId of mappedPropertyIds) {
        if (!contractTextProperties.some(({ id }) => id === propertyId)) {
          issues.push({
            code: "custom",
            message: `Vendor binding maps unknown or non-text property '${propertyId}'.`,
            path: `/entries/${String(index)}/figma/propertyMappings`,
          });
        }
      }
    }
  });
  return issues.length === 0
    ? createSuccessResult(registry)
    : validationFailure(
        "platform-component-registry",
        "The Platform Component Registry",
        issues,
      );
}
