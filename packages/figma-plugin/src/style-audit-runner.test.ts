import {
  createFigmaStyleAuditPlan,
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
  type FigmaStyleObservation,
} from "@agent-design-system-kit/core";
import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import {
  FILE_BINDING_SHARED_KEY,
  HATCHKIT_SHARED_NAMESPACE,
} from "./variables-writer.js";
import {
  runFigmaStyleAudit,
  StyleAuditError,
  type FigmaStyleAuditPort,
} from "./style-audit-runner.js";

function plan() {
  const documents: DesignSystemSourceDocument[] = [
    {
      kind: "token-set",
      sourcePath: "tokens/a.tokens.json",
      value: validTokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/a.component.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/a.registry.json",
      value: validRegistry,
    },
  ];
  const snapshot = validateDesignSystemSnapshot("hatch-demo", documents);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const planned = createFigmaStyleAuditPlan(snapshot.data);
  if (!planned.ok) throw new Error(planned.error.message);
  return planned.data;
}

function port(
  observations: readonly FigmaStyleObservation[],
  fileBindingId = "00000000-0000-4000-8000-000000000001",
): FigmaStyleAuditPort {
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
        throw new Error("Read-only audit must not write Shared Plugin Data.");
      },
    },
    getCurrentPage: () => ({ id: "1:2", name: "Page 1" }),
    getStyleObservations: () => Promise.resolve(observations),
  };
}

describe("Figma style audit runner", () => {
  it("reports a deliberately hard-coded style without mutating the port", async () => {
    await expect(
      runFigmaStyleAudit(
        port([
          {
            actual: "12px",
            binding: null,
            field: "paddingLeft",
            kind: "dimension",
            node: { id: "3:4", name: "Card", type: "FRAME" },
          },
        ]),
        plan(),
      ),
    ).resolves.toMatchObject({
      findings: [
        {
          code: "HARD_CODED_STYLE",
          field: "paddingLeft",
          node: { id: "3:4" },
        },
      ],
      passed: false,
      type: "audit.styles.scan",
    });
  });

  it("fails before scanning when the open file binding differs", async () => {
    await expect(
      runFigmaStyleAudit(
        port([], "00000000-0000-4000-8000-000000000099"),
        plan(),
      ),
    ).rejects.toBeInstanceOf(StyleAuditError);
  });
});
