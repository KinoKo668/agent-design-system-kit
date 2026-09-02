import {
  figmaPlatformAuditPlanSchema,
  type FigmaPlatformObservation,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import {
  runFigmaPlatformAudit,
  type FigmaPlatformAuditPort,
} from "./platform-audit-runner.js";
import {
  bindFigmaLibraryFile,
  type SharedPluginDataPort,
} from "./variables-writer.js";

const DIGEST = `sha256:${"6".repeat(64)}`;
const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";
const plan = figmaPlatformAuditPlanSchema.parse({
  fileBindingId: FILE_BINDING_ID,
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

function documentPort(): SharedPluginDataPort {
  const data = new Map<string, string>();
  const port = {
    getSharedPluginData: (namespace: string, key: string) =>
      data.get(`${namespace}/${key}`) ?? "",
    setSharedPluginData: (namespace: string, key: string, value: string) =>
      data.set(`${namespace}/${key}`, value),
  };
  bindFigmaLibraryFile(port, {
    fileBindingId: FILE_BINDING_ID,
    fileRole: "design-page",
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
  });
  return port;
}

function observation(source: FigmaPlatformObservation["source"]) {
  return {
    marker: {
      approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
      bindingId: "button/ios-26-phone",
      bindingVersion: "1.0.0",
      componentKey: "apple_button_key_100",
      contentDigest: DIGEST,
      instanceStableId: "hatch-demo/instance/settings/save-button",
      libraryId: "apple/ios-ipados-26",
      phase: "applied" as const,
      platformTargetId: "ios-26-phone",
      platformTargetVersion: "1.0.0",
      projectId: "hatch-demo",
      status: "valid" as const,
    },
    node: {
      id: "300:400",
      name: "Official Button",
      type: source === null ? "FRAME" : "INSTANCE",
    },
    source,
  };
}

function port(
  observations: readonly FigmaPlatformObservation[],
): FigmaPlatformAuditPort {
  return {
    document: documentPort(),
    getCurrentPage: () => ({ id: "1:2", name: "Settings" }),
    getObservations: () => Promise.resolve(observations),
  };
}

describe("runFigmaPlatformAudit", () => {
  it("passes an exact remote Instance", async () => {
    const result = await runFigmaPlatformAudit(
      port([
        observation({ componentKey: "apple_button_key_100", remote: true }),
      ]),
      plan,
    );
    expect(result.passed).toBe(true);
    expect(result.summary.compliantInstances).toBe(1);
  });

  it("detects a detached official Instance", async () => {
    const result = await runFigmaPlatformAudit(port([observation(null)]), plan);
    expect(result.passed).toBe(false);
    expect(result.summary.detached).toBe(1);
  });
});
