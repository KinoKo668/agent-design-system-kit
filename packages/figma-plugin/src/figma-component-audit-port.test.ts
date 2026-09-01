import { describe, expect, it, vi } from "vitest";

import { createFigmaComponentAuditPort } from "./figma-component-audit-port.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

function pluginData(value: object) {
  return (namespace: string, key: string) =>
    namespace === HATCHKIT_SHARED_NAMESPACE && key === MANAGED_ASSET_SHARED_KEY
      ? JSON.stringify(value)
      : "";
}

const setMarker = {
  appliedDigest: `sha256:${"a".repeat(64)}`,
  approvalId: "approval.component.button.1.0.0",
  assetId: "button",
  assetType: "component",
  assetVersion: "1.0.0",
  channel: "library",
  majorVersion: 1,
  phase: "applied",
  projectId: "hatch-demo",
  role: "component-set",
  schemaVersion: "1.0.0",
  slotId: "root",
};

const variantMarker = {
  ...setMarker,
  role: "component-variant",
  slotId: "variant/appearance-primary/state-default",
};

const instanceMarker = {
  assetType: "component-instance",
  componentSetStableId: "hatch-demo/component/button/component-set/major-1",
  instanceStableId: "hatch-demo/instance/checkout/submit",
  phase: "applied",
  schemaVersion: "1.0.0",
  variantStableId:
    "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
};

describe("Figma component audit observation port", () => {
  it("reads registered Instance provenance and preserves detached managed nodes", async () => {
    const setSharedPluginData = vi.fn();
    const componentSet = {
      getSharedPluginData: pluginData(setMarker),
      id: "100:200",
      type: "COMPONENT_SET",
    };
    const component = {
      getSharedPluginData: pluginData(variantMarker),
      id: "100:201",
      name: "Appearance=Primary, State=Default",
      parent: componentSet,
      type: "COMPONENT",
    };
    const instance = {
      getMainComponentAsync: () => Promise.resolve(component),
      getSharedPluginData: pluginData(instanceMarker),
      id: "3:4",
      name: "Submit",
      type: "INSTANCE",
      variantProperties: { Appearance: "Primary", State: "Default" },
    };
    const detached = {
      getSharedPluginData: pluginData(instanceMarker),
      id: "5:6",
      name: "Detached",
      type: "FRAME",
    };
    const ignored = {
      getSharedPluginData: () => "",
      id: "7:8",
      name: "Plain frame",
      type: "FRAME",
    };
    const figmaApi = {
      currentPage: {
        findAll: () => [instance, detached, ignored],
        id: "1:2",
        name: "Checkout",
      },
      root: {
        getSharedPluginData: () => "",
        setSharedPluginData,
      },
    };

    const observations =
      await createFigmaComponentAuditPort(figmaApi).getComponentObservations();

    expect(observations).toEqual([
      {
        managedInstance: {
          componentSetStableId:
            "hatch-demo/component/button/component-set/major-1",
          instanceStableId: "hatch-demo/instance/checkout/submit",
          phase: "applied",
          variantStableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
        },
        node: { id: "3:4", name: "Submit", type: "INSTANCE" },
        source: {
          componentNodeId: "100:201",
          componentSetNodeId: "100:200",
          componentSetStableId:
            "hatch-demo/component/button/component-set/major-1",
          componentStableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
          variantProperties: { Appearance: "Primary", State: "Default" },
        },
      },
      {
        managedInstance: {
          componentSetStableId:
            "hatch-demo/component/button/component-set/major-1",
          instanceStableId: "hatch-demo/instance/checkout/submit",
          phase: "applied",
          variantStableId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
        },
        node: { id: "5:6", name: "Detached", type: "FRAME" },
        source: null,
      },
    ]);
    expect(setSharedPluginData).not.toHaveBeenCalled();
  });
});
