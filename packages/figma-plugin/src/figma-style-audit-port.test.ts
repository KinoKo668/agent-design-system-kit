import { describe, expect, it, vi } from "vitest";

import { createFigmaStyleAuditPort } from "./figma-style-audit-port.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

const REGISTERED_STABLE_ID =
  "hatch-demo/token-set/foundation/variables/major-1/variable/semantic/radius/control";

function managedVariable(id: string) {
  return {
    getSharedPluginData: (namespace: string, key: string) =>
      namespace === HATCHKIT_SHARED_NAMESPACE &&
      key === MANAGED_ASSET_SHARED_KEY
        ? JSON.stringify({
            assetId: "foundation",
            assetType: "token-set",
            channel: "library",
            majorVersion: 1,
            phase: "applied",
            projectId: "hatch-demo",
            role: "variable",
            schemaVersion: "1.0.0",
            slotId: "semantic/radius/control",
          })
        : "",
    id,
  };
}

describe("Figma style audit observation port", () => {
  it("reads concrete page styles and resolves only managed Variable identities", async () => {
    const setSharedPluginData = vi.fn();
    const frame = {
      boundVariables: {
        cornerRadius: { id: "VariableID:registered" },
        paddingLeft: { id: "VariableID:foreign" },
      },
      cornerRadius: 8,
      fills: [
        {
          color: { b: 1, g: 0.4, r: 0.2 },
          opacity: 1,
          type: "SOLID",
          visible: true,
        },
      ],
      id: "3:4",
      itemSpacing: 0,
      name: "Card",
      opacity: 1,
      paddingBottom: 0,
      paddingLeft: 12,
      paddingRight: 0,
      paddingTop: 0,
      strokes: [],
      type: "FRAME",
    };
    const figmaApi = {
      currentPage: {
        findAll: () => [frame],
        id: "1:2",
        name: "Page 1",
      },
      mixed: Symbol("mixed"),
      root: {
        getSharedPluginData: () => "",
        setSharedPluginData,
      },
      variables: {
        getLocalVariablesAsync: () =>
          Promise.resolve([managedVariable("VariableID:registered")]),
      },
    };

    const observations =
      await createFigmaStyleAuditPort(figmaApi).getStyleObservations();

    expect(observations).toEqual([
      expect.objectContaining({
        binding: null,
        field: "fills[0].color",
        kind: "color",
        node: { id: "3:4", name: "Card", type: "FRAME" },
      }),
      expect.objectContaining({
        binding: {
          id: "VariableID:registered",
          stableId: REGISTERED_STABLE_ID,
        },
        field: "cornerRadius",
        kind: "dimension",
      }),
      expect.objectContaining({
        binding: { id: "VariableID:foreign", stableId: null },
        field: "paddingLeft",
        kind: "dimension",
      }),
    ]);
    expect(setSharedPluginData).not.toHaveBeenCalled();
  });
});
