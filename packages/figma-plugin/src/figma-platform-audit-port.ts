import type { FigmaPlatformObservation } from "@agent-design-system-kit/core";

import type { FigmaPlatformAuditPort } from "./platform-audit-runner.js";
import { isPlatformMarkerCandidate } from "./platform-marker-candidate.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMarker(serialized: string): FigmaPlatformObservation["marker"] {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (
      !isRecord(value) ||
      value.assetType !== "official-platform-instance" ||
      value.schemaVersion !== "1.0.0" ||
      typeof value.approvalId !== "string" ||
      typeof value.bindingId !== "string" ||
      typeof value.bindingVersion !== "string" ||
      typeof value.componentKey !== "string" ||
      typeof value.contentDigest !== "string" ||
      typeof value.instanceStableId !== "string" ||
      typeof value.libraryId !== "string" ||
      !["applied", "creating"].includes(String(value.phase)) ||
      typeof value.platformTargetId !== "string" ||
      typeof value.platformTargetVersion !== "string" ||
      typeof value.projectId !== "string"
    ) {
      return { status: "invalid" };
    }
    return {
      approvalId: value.approvalId,
      bindingId: value.bindingId,
      bindingVersion: value.bindingVersion,
      componentKey: value.componentKey,
      contentDigest: value.contentDigest,
      instanceStableId: value.instanceStableId,
      libraryId: value.libraryId,
      phase: value.phase as "applied" | "creating",
      platformTargetId: value.platformTargetId,
      platformTargetVersion: value.platformTargetVersion,
      projectId: value.projectId,
      status: "valid",
    };
  } catch {
    return { status: "invalid" };
  }
}

export function createFigmaPlatformAuditPort(
  figmaApi: PluginAPI,
): FigmaPlatformAuditPort {
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace, key, value) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    },
    getCurrentPage: () => ({
      id: figmaApi.currentPage.id,
      name: figmaApi.currentPage.name,
    }),
    async getObservations() {
      const nodes = figmaApi.currentPage.findAll(
        (node) =>
          node.getSharedPluginData(
            HATCHKIT_SHARED_NAMESPACE,
            MANAGED_ASSET_SHARED_KEY,
          ).length > 0,
      );
      return Promise.all(
        nodes.flatMap((node) => {
          const serialized = node.getSharedPluginData(
            HATCHKIT_SHARED_NAMESPACE,
            MANAGED_ASSET_SHARED_KEY,
          );
          if (!isPlatformMarkerCandidate(serialized)) {
            return [];
          }
          return [
            (async (): Promise<FigmaPlatformObservation> => {
              if (node.type !== "INSTANCE") {
                return {
                  marker: parseMarker(serialized),
                  node: { id: node.id, name: node.name, type: node.type },
                  source: null,
                };
              }
              const component = await node.getMainComponentAsync();
              return {
                marker: parseMarker(serialized),
                node: { id: node.id, name: node.name, type: node.type },
                source:
                  component === null
                    ? null
                    : { componentKey: component.key, remote: component.remote },
              };
            })(),
          ];
        }),
      );
    },
  };
}
