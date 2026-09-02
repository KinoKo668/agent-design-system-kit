import { describe, expect, it } from "vitest";

import buttonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import componentRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import tokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import { approvalRecordSchema } from "./approval-record.js";
import { validateDesignSystemSnapshot } from "./design-system-snapshot.js";
import { createFigmaPlatformInstancePlan } from "./figma-platform-instance-plan.js";
import { resolvePlatformComponent } from "./platform-component-query.js";
import type {
  PlatformComponentRegistry,
  PlatformTarget,
} from "./platform-library.js";

const TARGET_DIGEST = `sha256:${"2".repeat(64)}`;

function target(
  nativeFidelity: PlatformTarget["nativeFidelity"],
): PlatformTarget {
  return {
    assetId: "ios-26-phone",
    assetType: "platform-target",
    assetVersion: "1.0.0",
    contentDigest: TARGET_DIGEST,
    formFactor: "phone",
    implementationFramework: "swiftui",
    libraryBindings: [
      {
        enablement: "user-must-enable",
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
    nativeFidelity,
    osVersion: "26",
    platform: "ios",
    projectId: "hatch-demo",
    releaseChannel: "stable",
    resolutionPolicy: {
      allowCrossPlatformFallback: false,
      allowDetachedInstances: false,
      missingComponentAction: "change-request",
      priority: [
        "platform-system",
        "official-vendor",
        "brand-wrapper",
        "hatchkit-managed",
        "change-request",
      ],
      requireExactVersion: true,
    },
    schemaVersion: "1.0.0",
  };
}

function platformRegistry(
  currentTarget: PlatformTarget,
  status: "cataloged" | "ready",
): PlatformComponentRegistry {
  const figma: PlatformComponentRegistry["entries"][number]["figma"] =
    status === "cataloged"
      ? { status: "cataloged" }
      : {
          libraryKey: "apple_library_key_26",
          mappings: buttonContract.variants.map((variant, index) => ({
            componentKey: `apple_button_key_${String(index + 100)}`,
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
        };
  return {
    entries: [
      {
        bindingId: "button/ios-26-phone",
        bindingVersion: "1.0.0",
        component: {
          contentDigest: buttonContract.contentDigest,
          id: "button",
          version: "1.0.0",
        },
        contentDigest: TARGET_DIGEST,
        figma,
        lifecycle: "active",
        lifecycleReason: null,
        platformTarget: {
          assetId: currentTarget.assetId,
          assetVersion: currentTarget.assetVersion,
          contentDigest: TARGET_DIGEST,
        },
        review:
          status === "ready"
            ? {
                approvalId:
                  "approval.platform-binding.button.ios-26-phone.1.0.0",
                status: "approved",
              }
            : { approvalId: null, status: "unreviewed" },
        source: {
          kind: "vendor-library",
          libraryId: "apple/ios-ipados-26",
          official: true,
          redistribution: "external-reference-only",
          vendor: "apple",
        },
      },
    ],
    projectId: "hatch-demo",
    registryType: "platform-component-registry",
    schemaVersion: "1.0.0",
  };
}

function snapshot(
  currentTarget: PlatformTarget,
  registry?: PlatformComponentRegistry,
) {
  const readyEntry = registry?.entries.find(
    ({ figma }) => figma.status === "ready",
  );
  const bindingApproval =
    readyEntry === undefined
      ? undefined
      : approvalRecordSchema.parse({
          approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
          decisions: [
            {
              decidedAt: "2026-09-02T12:10:00Z",
              decision: "approved",
              reviewer: "human:designer",
              role: "design_owner",
              summary: "Official mapping verified.",
            },
            {
              decidedAt: "2026-09-02T12:11:00Z",
              decision: "approved",
              reviewer: "human:engineer",
              role: "technical_owner",
              summary: "Import and identity checks passed.",
            },
          ],
          dependencies: [
            {
              approvalId: "approval.component.button.1.0.0",
              assetId: "button",
              assetVersion: "1.0.0",
              contentDigest: buttonContract.contentDigest,
              projectId: "hatch-demo",
              type: "component",
            },
            {
              approvalId: "approval.platform-target.ios-26-phone.1.0.0",
              assetId: "ios-26-phone",
              assetVersion: "1.0.0",
              contentDigest: TARGET_DIGEST,
              projectId: "hatch-demo",
              type: "platform-target",
            },
          ],
          evidence: [
            { kind: "figma", uri: "local-review://platform-binding/button" },
          ],
          policy: {
            requiredRoles: ["design_owner", "technical_owner"],
            requiredValidationChecks: [
              "schema",
              "contract-figma-parity",
              "official-source",
              "instance-import",
              "no-detach",
            ],
          },
          schemaVersion: "1.0.0",
          status: "approved",
          subject: {
            assetId: readyEntry.bindingId,
            assetVersion: readyEntry.bindingVersion,
            contentDigest: readyEntry.contentDigest,
            gitCommit: "a".repeat(40),
            projectId: "hatch-demo",
            type: "platform-binding",
          },
          submission: {
            submittedAt: "2026-09-02T12:00:00Z",
            submittedBy: "human:designer",
          },
          supersedes: null,
          termination: null,
          validations: [
            "schema",
            "contract-figma-parity",
            "official-source",
            "instance-import",
            "no-detach",
          ].map((check) => ({
            check,
            evidence: `local-review://platform-binding/${check}`,
            priority: "P0",
            status: "passed",
            validatedAt: "2026-09-02T12:05:00Z",
          })),
        });
  const result = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/button-foundation.tokens.json",
      value: tokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: buttonContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: componentRegistry,
    },
    {
      kind: "platform-target",
      sourcePath: "platforms/ios-26-phone.platform-target.json",
      value: currentTarget,
    },
    ...(registry === undefined
      ? []
      : [
          {
            kind: "platform-component-registry" as const,
            sourcePath: "platform-registry/ios-26.platform-registry.json",
            value: registry,
          },
        ]),
    ...(bindingApproval === undefined
      ? []
      : [
          {
            kind: "approval" as const,
            sourcePath:
              "approvals/platform-binding.button.ios-26-phone.approval.json",
            value: bindingApproval,
          },
        ]),
  ]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

const QUERY = {
  assetId: "button",
  platformTargetId: "ios-26-phone",
  platformTargetVersion: "1.0.0",
  projectId: "hatch-demo",
  variantSelections: { appearance: "primary", state: "default" },
};

describe("resolvePlatformComponent", () => {
  it("returns an exact official component key for an approved ready mapping", () => {
    const currentTarget = target("strict");
    const result = resolvePlatformComponent(
      snapshot(currentTarget, platformRegistry(currentTarget, "ready")),
      QUERY,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("official-library-ready");
      expect(result.data.priorityEvaluated).toEqual([
        "platform-system",
        "official-vendor",
      ]);
      if (result.data.status === "official-library-ready") {
        expect(result.data.componentKey).toContain("apple_button_key_");
        expect(result.data.libraryKey).toBe("apple_library_key_26");
      }
    }
  });

  it("stops for key verification and human review when metadata is only cataloged", () => {
    const currentTarget = target("strict");
    const result = resolvePlatformComponent(
      snapshot(currentTarget, platformRegistry(currentTarget, "cataloged")),
      QUERY,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("official-library-verification-required");
    }
  });

  it("blocks approximation when a strict target has no official mapping", () => {
    const result = resolvePlatformComponent(snapshot(target("strict")), QUERY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("IDENTITY_NOT_FOUND");
      expect(result.error.context?.missingConditions).toContain(
        "approved official vendor component mapping",
      );
    }
  });

  it("allows the existing managed component only when target fidelity permits it", () => {
    const result = resolvePlatformComponent(snapshot(target("adapted")), QUERY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("hatchkit-managed-fallback");
      expect(result.data.priorityEvaluated).toEqual([
        "platform-system",
        "official-vendor",
        "brand-wrapper",
        "hatchkit-managed",
      ]);
    }
  });
});

describe("createFigmaPlatformInstancePlan", () => {
  it("creates a zero-fallback plan with only approved official properties", () => {
    const currentTarget = target("strict");
    const result = createFigmaPlatformInstancePlan(
      snapshot(currentTarget, platformRegistry(currentTarget, "ready")),
      {
        ...QUERY,
        fileBindingId: "00000000-0000-4000-8000-000000000001",
        instanceId: "settings/save-button",
        propertyValues: { label: "Save" },
        x: 120,
        y: 240,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.constraints).toEqual({
        allowComponentMutation: false,
        allowDetach: false,
        allowFallback: false,
        requireRemote: true,
      });
      expect(result.data.propertyOverrides).toEqual([
        {
          contractPropertyId: "label",
          figmaPropertyName: "Label",
          value: "Save",
        },
      ]);
      expect(result.data.instance.stableId).toBe(
        "hatch-demo/instance/settings/save-button",
      );
    }
  });

  it("rejects a property that the approved official mapping does not expose", () => {
    const currentTarget = target("strict");
    const result = createFigmaPlatformInstancePlan(
      snapshot(currentTarget, platformRegistry(currentTarget, "ready")),
      {
        ...QUERY,
        fileBindingId: "00000000-0000-4000-8000-000000000001",
        instanceId: "settings/save-button",
        propertyValues: { unknown: "No" },
        x: 120,
        y: 240,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_FAILED");
  });
});
