import {
  writerCommandDeliverySchema,
  writerPluginResultSchema,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import {
  isWriterCommandDelivery,
  isWriterPluginResult,
} from "./writer-message-validation.js";

const DIGEST = `sha256:${"4".repeat(64)}`;

function delivery() {
  return {
    approval: {
      approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
      mode: "approved",
      subject: {
        assetId: "button/ios-26-phone",
        assetVersion: "1.0.0",
        contentDigest: DIGEST,
        projectId: "hatch-demo",
        type: "platform-binding",
      },
    },
    attempt: 1,
    command: {
      payload: {
        plan: {
          constraints: {
            allowComponentMutation: false,
            allowDetach: false,
            allowFallback: false,
            requireRemote: true,
          },
          instance: {
            stableId: "hatch-demo/instance/settings/save-button",
            x: 120,
            y: 240,
          },
          propertyOverrides: [
            {
              contractPropertyId: "label",
              figmaPropertyName: "Label#123:456",
              value: "Save",
            },
          ],
          schemaVersion: "1.0.0",
          selectedVariantId: "appearance-primary/state-default",
          source: {
            approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
            bindingId: "button/ios-26-phone",
            bindingVersion: "1.0.0",
            componentContentDigest: DIGEST,
            componentId: "button",
            componentKey: "apple_button_key_100",
            componentVersion: "1.0.0",
            contentDigest: DIGEST,
            fileBindingId: "00000000-0000-4000-8000-000000000001",
            libraryId: "apple/ios-ipados-26",
            libraryKey: "apple_library_key_26",
            platformTargetContentDigest: DIGEST,
            platformTargetId: "ios-26-phone",
            platformTargetVersion: "1.0.0",
            projectId: "hatch-demo",
            vendor: "apple",
            verifiedAt: "2026-09-02T12:00:00Z",
          },
        },
      },
      type: "instances.platform.insert",
    },
    idempotencyKey: "platform-instance:00000000-0000-4000-8000-000000000002",
    operationId: "00000000-0000-4000-8000-000000000002",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "hatchkit-mcp" },
    target: {
      fileBindingId: "00000000-0000-4000-8000-000000000001",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/page",
    },
  };
}

describe("official Platform Writer protocol", () => {
  it("is accepted by both Core and lightweight Plugin validators", () => {
    const value = delivery();
    expect(writerCommandDeliverySchema.safeParse(value).success).toBe(true);
    expect(isWriterCommandDelivery(value)).toBe(true);
  });

  it("rejects any command that enables detachment", () => {
    const value = delivery();
    value.command.payload.plan.constraints.allowDetach = true;
    expect(writerCommandDeliverySchema.safeParse(value).success).toBe(false);
    expect(isWriterCommandDelivery(value)).toBe(false);
  });

  it("accepts only a remote, non-detached success result", () => {
    const value = {
      ok: true,
      operationId: "00000000-0000-4000-8000-000000000002",
      pluginInstanceId: "00000000-0000-4000-8000-000000000003",
      result: {
        component: { key: "apple_button_key_100", remote: true },
        instance: {
          action: "created",
          detached: false,
          nodeId: "300:400",
          stableId: "hatch-demo/instance/settings/save-button",
        },
        type: "instances.platform.insert",
      },
      schemaVersion: "1.0.0",
    };
    expect(writerPluginResultSchema.safeParse(value).success).toBe(true);
    expect(isWriterPluginResult(value)).toBe(true);

    value.result.instance.detached = true;
    expect(writerPluginResultSchema.safeParse(value).success).toBe(false);
    expect(isWriterPluginResult(value)).toBe(false);
  });
});

describe("official Platform audit protocol", () => {
  const auditPlan = {
    fileBindingId: "00000000-0000-4000-8000-000000000001",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    scope: "current-page",
    sources: [
      {
        bindingId: "button/ios-26-phone",
        bindingVersion: "1.0.0",
        componentKeys: ["apple_button_key_100"],
        contentDigest: DIGEST,
        libraryId: "apple/ios-ipados-26",
        libraryKey: "apple_library_key_26",
        platform: "ios",
        platformTargetId: "ios-26-phone",
        platformTargetVersion: "1.0.0",
        releaseChannel: "stable",
        vendor: "apple",
      },
    ],
  };

  it("accepts a read-only exact platform audit command", () => {
    const value = {
      approval: { mode: "not_required", reason: "read_only_diagnostic" },
      attempt: 1,
      command: {
        payload: { plan: auditPlan },
        type: "audit.platform-components.scan",
      },
      idempotencyKey: "platform-audit:00000000-0000-4000-8000-000000000004",
      operationId: "00000000-0000-4000-8000-000000000004",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
      source: { client: "hatchkit-mcp" },
      target: {
        fileBindingId: "00000000-0000-4000-8000-000000000001",
        kind: "figma-file",
        stableId: "hatch-demo/figma-file/page",
      },
    };
    expect(writerCommandDeliverySchema.safeParse(value).success).toBe(true);
    expect(isWriterCommandDelivery(value)).toBe(true);
  });

  it("accepts a structurally exact empty-page audit result", () => {
    const value = {
      ok: true,
      operationId: "00000000-0000-4000-8000-000000000004",
      pluginInstanceId: "00000000-0000-4000-8000-000000000003",
      result: {
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
      },
      schemaVersion: "1.0.0",
    };
    expect(writerPluginResultSchema.safeParse(value).success).toBe(true);
    expect(isWriterPluginResult(value)).toBe(true);

    value.result.summary.auditedInstances = 1;
    expect(writerPluginResultSchema.safeParse(value).success).toBe(false);
    expect(isWriterPluginResult(value)).toBe(false);
  });
});
