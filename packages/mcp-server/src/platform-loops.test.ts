import { resolve } from "node:path";

import {
  platformComponentRegistrySchema,
  platformTargetSchema,
  type DesignSystemSnapshot,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import { runPlatformAuditLoop } from "./platform-audit-loop.js";
import { runPlatformInstanceLoop } from "./platform-instance-loop.js";
import { loadDesignSystemFromDirectory } from "./registry-files.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";
const DIGEST = `sha256:${"7".repeat(64)}`;

async function snapshot(): Promise<DesignSystemSnapshot> {
  const loaded = await loadDesignSystemFromDirectory({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
  });
  if (!loaded.ok) throw new Error(loaded.error.message);
  const component = loaded.data.components.find(
    ({ data }) => data.assetId === "button",
  )?.data;
  if (component === undefined) throw new Error("Button fixture missing.");
  const target = platformTargetSchema.parse({
    assetId: "ios-26-phone",
    assetType: "platform-target",
    assetVersion: "1.0.0",
    contentDigest: DIGEST,
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
    nativeFidelity: "strict",
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
  });
  const registry = platformComponentRegistrySchema.parse({
    entries: [
      {
        bindingId: "button/ios-26-phone",
        bindingVersion: "1.0.0",
        component: {
          contentDigest: component.contentDigest,
          id: component.assetId,
          version: component.assetVersion,
        },
        contentDigest: DIGEST,
        figma: {
          libraryKey: "apple_library_key_26",
          mappings: component.variants.map((variant, index) => ({
            componentKey: `apple_button_key_${String(index + 100)}`,
            componentName: `Button ${variant.id}`,
            variantId: variant.id,
          })),
          propertyMappings: [
            {
              contractPropertyId: "label",
              figmaPropertyName: "Label#123:456",
              figmaPropertyType: "TEXT",
              support: "writable",
            },
          ],
          status: "ready",
          verifiedAt: "2026-09-02T12:00:00Z",
        },
        lifecycle: "active",
        lifecycleReason: null,
        platformTarget: {
          assetId: target.assetId,
          assetVersion: target.assetVersion,
          contentDigest: DIGEST,
        },
        review: {
          approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
          status: "approved",
        },
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
  });
  return {
    ...loaded.data,
    platformRegistries: [
      { data: registry, sourcePath: "platform-registry/ios.registry.json" },
    ],
    platformTargets: [
      { data: target, sourcePath: "platforms/ios-26.target.json" },
    ],
  };
}

function operation(
  command: WriterCommandEnvelope,
  result: NonNullable<WriterOperation["result"]>,
): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: DIGEST,
    commandType: command.command.type,
    completedAt: "2026-09-02T12:00:01Z",
    dispatchedAt: "2026-09-02T12:00:00Z",
    idempotencyKeyHash: DIGEST,
    operationId: command.operationId,
    projectId: command.projectId,
    queuedAt: "2026-09-02T11:59:59Z",
    result,
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: command.target.stableId,
  };
}

describe("official Platform MCP loops", () => {
  it("submits one exact approved remote Instance command", async () => {
    const execute = vi.fn((command: WriterCommandEnvelope) =>
      Promise.resolve({
        data: operation(command, {
          component: {
            key:
              command.command.type === "instances.platform.insert"
                ? command.command.payload.plan.source.componentKey
                : "unexpected",
            remote: true,
          },
          instance: {
            action: "created",
            detached: false,
            nodeId: "300:400",
            stableId: "hatch-demo/instance/settings/save-button",
          },
          type: "instances.platform.insert",
        }),
        ok: true as const,
        schemaVersion: "1.0.0" as const,
        warnings: [],
      }),
    );
    const result = await runPlatformInstanceLoop(
      await snapshot(),
      {
        assetId: "button",
        fileBindingId: FILE_BINDING_ID,
        instanceId: "settings/save-button",
        platformTargetId: "ios-26-phone",
        platformTargetVersion: "1.0.0",
        propertyValues: { label: "Save" },
        requestId: REQUEST_ID,
        variantSelections: { appearance: "primary", state: "default" },
        x: 120,
        y: 240,
      },
      { expectedProjectId: "hatch-demo", writer: { execute } },
    );

    expect(result).toMatchObject({
      data: {
        audit: { detached: false, registry: "official-ready" },
        status: "inserted",
      },
      ok: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      approval: { mode: "approved" },
      command: { type: "instances.platform.insert" },
      target: { fileBindingId: FILE_BINDING_ID },
    });
  });

  it("returns a validated read-only platform audit report", async () => {
    const execute = vi.fn((command: WriterCommandEnvelope) =>
      Promise.resolve({
        data: operation(command, {
          findings: [],
          page: { id: "1:2", name: "Settings" },
          passed: true,
          schemaVersion: "1.0.0",
          scope: "current-page",
          summary: {
            auditedInstances: 0,
            compliantInstances: 0,
            detached: 0,
            provenanceMismatches: 0,
            sourceKeyMismatches: 0,
            targetMismatches: 0,
            unregisteredBindings: 0,
          },
          type: "audit.platform-components.scan",
        }),
        ok: true as const,
        schemaVersion: "1.0.0" as const,
        warnings: [],
      }),
    );
    const result = await runPlatformAuditLoop(
      await snapshot(),
      { fileBindingId: FILE_BINDING_ID, requestId: REQUEST_ID },
      { expectedProjectId: "hatch-demo", writer: { execute } },
    );

    expect(result).toMatchObject({
      data: { audit: { passed: true }, status: "passed" },
      ok: true,
    });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      approval: { mode: "not_required", reason: "read_only_diagnostic" },
      command: { type: "audit.platform-components.scan" },
    });
  });
});
