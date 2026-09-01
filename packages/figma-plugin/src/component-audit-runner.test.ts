import {
  auditFigmaComponentObservations,
  createFigmaComponentAuditPlan,
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
  type FigmaComponentObservation,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import {
  ComponentAuditError,
  runFigmaComponentAudit,
  type FigmaComponentAuditPort,
} from "./component-audit-runner.js";
import {
  FILE_BINDING_SHARED_KEY,
  HATCHKIT_SHARED_NAMESPACE,
} from "./variables-writer.js";

function plan() {
  const documents: DesignSystemSourceDocument[] = [
    { kind: "token-set", sourcePath: "tokens/a.json", value: validTokenSet },
    {
      kind: "component",
      sourcePath: "components/a.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/a.json",
      value: validRegistry,
    },
  ];
  const snapshot = validateDesignSystemSnapshot("hatch-demo", documents);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const planned = createFigmaComponentAuditPlan(snapshot.data);
  if (!planned.ok) throw new Error(planned.error.message);
  return planned.data;
}

function port(
  observations: readonly FigmaComponentObservation[],
  fileBindingId = "00000000-0000-4000-8000-000000000001",
): FigmaComponentAuditPort {
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        namespace === HATCHKIT_SHARED_NAMESPACE &&
        key === FILE_BINDING_SHARED_KEY
          ? JSON.stringify({
              fileBindingId,
              fileRole: "design-system-library",
              projectId: "hatch-demo",
              schemaVersion: "1.0.0",
            })
          : "",
      setSharedPluginData: () => {
        throw new Error("Read-only component audit must not write.");
      },
    },
    getComponentObservations: () => Promise.resolve(observations),
    getCurrentPage: () => ({ id: "1:2", name: "Page 1" }),
  };
}

describe("Figma component audit runner", () => {
  it("reports a managed detached component without mutating the port", async () => {
    const planned = plan();
    const source = planned.sources[0];
    const variant = source?.variants[0];
    if (source === undefined || variant === undefined) {
      throw new Error("Expected audit source.");
    }
    const observations: FigmaComponentObservation[] = [
      {
        managedInstance: {
          componentSetStableId: source.componentSetStableId,
          instanceStableId: "hatch-demo/instance/page/detached",
          phase: "applied",
          variantStableId: variant.stableId,
        },
        node: { id: "3:4", name: "Detached Button", type: "FRAME" },
        source: null,
      },
    ];
    const pluginResult = await runFigmaComponentAudit(
      port(observations),
      planned,
    );
    const coreResult = auditFigmaComponentObservations(
      planned,
      { id: "1:2", name: "Page 1" },
      observations,
    );
    if (!coreResult.ok) throw new Error(coreResult.error.message);

    expect(pluginResult).toEqual(coreResult.data);
    expect(pluginResult).toMatchObject({
      findings: [
        {
          code: "DETACHED_OR_APPROXIMATE_COMPONENT",
          node: { id: "3:4" },
        },
        {
          code: "INSTANCE_PROVENANCE_MISMATCH",
          node: { id: "3:4" },
        },
      ],
      passed: false,
      type: "audit.components.scan",
    });
  });

  it("fails before scanning when the open file binding differs", async () => {
    await expect(
      runFigmaComponentAudit(
        port([], "00000000-0000-4000-8000-000000000099"),
        plan(),
      ),
    ).rejects.toBeInstanceOf(ComponentAuditError);
  });
});
