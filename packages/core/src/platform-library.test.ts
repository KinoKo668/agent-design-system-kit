import { describe, expect, it } from "vitest";

import buttonFixture from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import { validateComponentContract } from "./component-contract.js";
import {
  PLATFORM_COMPONENT_RESOLUTION_PRIORITY,
  platformComponentRegistrySchema,
  platformTargetSchema,
  toPlatformTargetDigestSubject,
  validatePlatformComponentRegistry,
  validatePlatformComponentRegistryWithAssets,
  validatePlatformTarget,
  type PlatformComponentRegistry,
  type PlatformTarget,
} from "./platform-library.js";

const DIGEST = `sha256:${"1".repeat(64)}`;

function createIosTarget(
  overrides: Partial<PlatformTarget> = {},
): PlatformTarget {
  return platformTargetSchema.parse({
    assetId: "ios-26-phone",
    assetType: "platform-target",
    assetVersion: "1.0.0",
    contentDigest: DIGEST,
    formFactor: "phone",
    implementationFramework: "swiftui",
    libraryBindings: [
      {
        enablement: "user-must-enable",
        figmaCommunityUrl:
          "https://www.figma.com/community/file/0000000000000000000/example",
        kitName: "iOS and iPadOS 26 UI Kit",
        kitVersion: "26",
        libraryId: "apple/ios-ipados-26",
        official: true,
        officialSourceUrl: "https://developer.apple.com/design/resources/",
        publisher: "Apple",
        redistribution: "external-reference-only",
        releaseChannel: "stable",
        supportedPlatforms: ["ios", "ipados"],
        vendor: "apple",
        verification: { status: "metadata-verified" },
      },
    ],
    name: "iOS 26 phone",
    nativeFidelity: "strict",
    osVersion: "26",
    platform: "ios",
    projectId: "hatch-demo",
    releaseChannel: "stable",
    resolutionPolicy: {
      allowCrossPlatformFallback: false,
      allowDetachedInstances: false,
      missingComponentAction: "change-request",
      priority: PLATFORM_COMPONENT_RESOLUTION_PRIORITY,
      requireExactVersion: true,
    },
    schemaVersion: "1.0.0",
    ...overrides,
  });
}

function createRegistry(
  target: PlatformTarget,
  overrides: Partial<PlatformComponentRegistry["entries"][number]> = {},
): PlatformComponentRegistry {
  return platformComponentRegistrySchema.parse({
    entries: [
      {
        bindingId: "button/ios-26-phone",
        bindingVersion: "1.0.0",
        component: {
          contentDigest: buttonFixture.contentDigest,
          id: "button",
          version: "1.0.0",
        },
        contentDigest: DIGEST,
        figma: { status: "cataloged" },
        lifecycle: "active",
        lifecycleReason: null,
        platformTarget: {
          assetId: target.assetId,
          assetVersion: target.assetVersion,
          contentDigest: target.contentDigest,
        },
        review: { approvalId: null, status: "unreviewed" },
        source: {
          kind: "vendor-library",
          libraryId: "apple/ios-ipados-26",
          official: true,
          redistribution: "external-reference-only",
          vendor: "apple",
        },
        ...overrides,
      },
    ],
    projectId: "hatch-demo",
    registryType: "platform-component-registry",
    schemaVersion: "1.0.0",
  });
}

describe("Platform Target", () => {
  it("accepts an official Apple stable target and has an explicit digest subject", () => {
    const target = createIosTarget();
    const result = validatePlatformTarget(target);

    expect(result.ok).toBe(true);
    expect(toPlatformTargetDigestSubject(target)).not.toHaveProperty(
      "contentDigest",
    );
    expect(target.resolutionPolicy.priority).toEqual([
      "platform-system",
      "official-vendor",
      "brand-wrapper",
      "hatchkit-managed",
      "change-request",
    ]);
  });

  it("rejects cross-platform vendor claims and preview kits in stable targets", () => {
    const invalid = {
      ...createIosTarget(),
      libraryBindings: [
        {
          ...createIosTarget().libraryBindings[0],
          releaseChannel: "preview",
          supportedPlatforms: ["android"],
        },
      ],
    };
    const result = validatePlatformTarget(invalid);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.error.context?.details?.issues)).toContain(
        "/libraryBindings",
      );
    }
  });

  it("rejects an Apple framework on Android", () => {
    const result = validatePlatformTarget({
      ...createIosTarget(),
      implementationFramework: "swiftui",
      libraryBindings: [
        {
          ...createIosTarget().libraryBindings[0],
          libraryId: "google/material-3",
          officialSourceUrl: "https://m3.material.io/",
          publisher: "Google",
          supportedPlatforms: ["android"],
          vendor: "google",
        },
      ],
      platform: "android",
    });
    expect(result.ok).toBe(false);
  });

  it("keeps iOS 27 Preview on a separate explicit target track", () => {
    const base = createIosTarget();
    const result = validatePlatformTarget(
      createIosTarget({
        assetId: "ios-27-preview-phone",
        libraryBindings: [
          {
            ...base.libraryBindings[0]!,
            kitName: "iOS and iPadOS 27 UI Kit",
            kitVersion: "27 beta",
            libraryId: "apple/ios-ipados-27-preview",
            releaseChannel: "preview",
          },
        ],
        name: "iOS 27 Preview phone",
        osVersion: "27",
        releaseChannel: "preview",
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts Android Material 3 as a Google-owned Android-only target", () => {
    const result = validatePlatformTarget({
      ...createIosTarget(),
      assetId: "android-material-3-phone",
      implementationFramework: "compose",
      libraryBindings: [
        {
          enablement: "user-must-enable",
          kitName: "Material 3 Design Kit",
          kitVersion: "Material 3",
          libraryId: "google/material-3",
          official: true,
          officialSourceUrl: "https://m3.material.io/",
          publisher: "Google",
          redistribution: "external-reference-only",
          releaseChannel: "stable",
          supportedPlatforms: ["android"],
          vendor: "google",
          verification: { status: "metadata-verified" },
        },
      ],
      name: "Android Material 3 phone",
      osVersion: "16",
      platform: "android",
    });
    expect(result.ok).toBe(true);
  });
});

describe("Platform Component Registry", () => {
  it("keeps an unreviewed official mapping cataloged and non-insertable", () => {
    const target = createIosTarget();
    const result = validatePlatformComponentRegistry(createRegistry(target));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.entries[0]?.figma.status).toBe("cataloged");
      expect(result.data.entries[0]?.review.status).toBe("unreviewed");
    }
  });

  it("requires an approved review before a mapping can be ready", () => {
    const target = createIosTarget();
    const result = validatePlatformComponentRegistry({
      ...createRegistry(target),
      entries: [
        {
          ...createRegistry(target).entries[0],
          figma: {
            libraryKey: "library_key_123",
            mappings: [
              {
                componentKey: "component_key_123",
                componentName: "Button",
                variantId: "appearance-primary/state-default",
              },
            ],
            status: "ready",
            verifiedAt: "2026-09-02T12:00:00Z",
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("requires a complete exact mapping for every Contract Variant", () => {
    const target = createIosTarget();
    const componentResult = validateComponentContract(buttonFixture);
    expect(componentResult.ok).toBe(true);
    if (!componentResult.ok) return;

    const registry = createRegistry(target, {
      figma: {
        libraryKey: "library_key_123",
        mappings: componentResult.data.variants.map((variant, index) => ({
          componentKey: `component_key_${String(index + 100)}`,
          componentName: `Button ${variant.id}`,
          variantId: variant.id,
        })),
        propertyMappings: [
          {
            contractPropertyId: "label",
            figmaPropertyName: "Label",
            figmaPropertyType: "TEXT",
            support: "writable",
          },
        ],
        status: "ready",
        verifiedAt: "2026-09-02T12:00:00Z",
      },
      review: {
        approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
        status: "approved",
      },
    });
    const result = validatePlatformComponentRegistryWithAssets(
      registry,
      [target],
      [componentResult.data],
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a vendor source that is absent from the target", () => {
    const target = createIosTarget();
    const componentResult = validateComponentContract(buttonFixture);
    expect(componentResult.ok).toBe(true);
    if (!componentResult.ok) return;
    const registry = createRegistry(target, {
      source: {
        kind: "vendor-library",
        libraryId: "apple/unknown-kit",
        official: true,
        redistribution: "external-reference-only",
        vendor: "apple",
      },
    });

    const result = validatePlatformComponentRegistryWithAssets(
      registry,
      [target],
      [componentResult.data],
    );
    expect(result.ok).toBe(false);
  });
});
