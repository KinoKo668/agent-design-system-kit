import { describe, expect, it } from "vitest";

import {
  auditFigmaPlatformObservations,
  figmaPlatformAuditPlanSchema,
  type FigmaPlatformObservation,
} from "./platform-component-audit.js";

const DIGEST = `sha256:${"5".repeat(64)}`;
const plan = figmaPlatformAuditPlanSchema.parse({
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
});

function observation(
  overrides: Partial<FigmaPlatformObservation> = {},
): FigmaPlatformObservation {
  return {
    marker: {
      approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
      bindingId: "button/ios-26-phone",
      bindingVersion: "1.0.0",
      componentKey: "apple_button_key_100",
      contentDigest: DIGEST,
      instanceStableId: "hatch-demo/instance/settings/save-button",
      libraryId: "apple/ios-ipados-26",
      phase: "applied",
      platformTargetId: "ios-26-phone",
      platformTargetVersion: "1.0.0",
      projectId: "hatch-demo",
      status: "valid",
    },
    node: { id: "300:400", name: "Save", type: "INSTANCE" },
    source: { componentKey: "apple_button_key_100", remote: true },
    ...overrides,
  };
}

describe("auditFigmaPlatformObservations", () => {
  it("accepts an exact remote official Instance", () => {
    const result = auditFigmaPlatformObservations(
      plan,
      { id: "1:2", name: "Settings" },
      [observation()],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.passed).toBe(true);
      expect(result.data.summary.compliantInstances).toBe(1);
    }
  });

  it("reports a detached official node", () => {
    const result = auditFigmaPlatformObservations(
      plan,
      { id: "1:2", name: "Settings" },
      [
        observation({
          node: { id: "300:400", name: "Save", type: "FRAME" },
          source: null,
        }),
      ],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.findings.map(({ code }) => code)).toContain(
        "OFFICIAL_INSTANCE_DETACHED",
      );
    }
  });

  it("reports tampered provenance and an unapproved remote source key", () => {
    const current = observation();
    if (current.marker.status === "valid") current.marker.phase = "creating";
    current.source = { componentKey: "different_component_key", remote: true };
    const result = auditFigmaPlatformObservations(
      plan,
      { id: "1:2", name: "Settings" },
      [current],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.findings.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "PLATFORM_PROVENANCE_MISMATCH",
          "OFFICIAL_SOURCE_KEY_MISMATCH",
        ]),
      );
    }
  });
});
