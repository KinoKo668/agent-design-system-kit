import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";
import { isSuccessResult } from "./results.js";
import {
  auditFigmaStyleObservations,
  createFigmaStyleAuditPlan,
} from "./style-audit.js";

function snapshot(registry: unknown = validRegistry) {
  const documents: DesignSystemSourceDocument[] = [
    {
      kind: "token-set",
      sourcePath: "tokens/foundation.tokens.json",
      value: validTokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: validContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: registry,
    },
  ];
  const result = validateDesignSystemSnapshot("hatch-demo", documents);
  if (!isSuccessResult(result)) throw new Error(result.error.message);
  return result.data;
}

describe("Figma style audit", () => {
  it("builds a deterministic registered Variable allowlist from active Git assets", () => {
    const result = createFigmaStyleAuditPlan(snapshot());

    expect(result).toMatchObject({
      data: {
        fileBindingId: "00000000-0000-4000-8000-000000000001",
        projectId: "hatch-demo",
        scope: "current-page",
      },
      ok: true,
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.registeredVariables).toHaveLength(30);
    expect(result.data.registeredVariables).toContainEqual({
      stableId:
        "hatch-demo/token-set/button-foundation/variables/major-1/variable/semantic/color/action-primary-background",
      tokenPath: "semantic/color/action-primary-background",
    });
    expect(result.data.registeredVariables).toEqual(
      [...result.data.registeredVariables].sort((left, right) =>
        left.stableId.localeCompare(right.stableId),
      ),
    );
  });

  it("finds hard-coded values and bindings to unregistered Variables with node evidence", () => {
    const planned = createFigmaStyleAuditPlan(snapshot());
    if (!planned.ok) throw new Error(planned.error.message);
    const registered = planned.data.registeredVariables.find(({ tokenPath }) =>
      tokenPath.endsWith("action-primary-background"),
    );
    if (registered === undefined) throw new Error("Expected registered token.");

    const result = auditFigmaStyleObservations(
      planned.data,
      { id: "1:2", name: "Settings" },
      [
        {
          actual: "#3366ff",
          binding: { id: "VariableID:1:3", stableId: registered.stableId },
          field: "fills[0].color",
          kind: "color",
          node: { id: "3:4", name: "Save", type: "INSTANCE" },
        },
        {
          actual: "12px",
          binding: null,
          field: "paddingLeft",
          kind: "dimension",
          node: { id: "5:6", name: "One-off card", type: "FRAME" },
        },
        {
          actual: "8px",
          binding: { id: "VariableID:9:9", stableId: null },
          field: "cornerRadius",
          kind: "dimension",
          node: { id: "7:8", name: "Foreign control", type: "FRAME" },
        },
      ],
    );

    expect(result).toMatchObject({
      data: {
        findings: [
          {
            code: "HARD_CODED_STYLE",
            field: "paddingLeft",
            node: { id: "5:6", name: "One-off card" },
          },
          {
            actual: { bindingVariableId: "VariableID:9:9" },
            code: "UNREGISTERED_VARIABLE",
            field: "cornerRadius",
            node: { id: "7:8", name: "Foreign control" },
          },
        ],
        passed: false,
        summary: {
          auditedStyles: 3,
          hardCodedStyles: 1,
          nodesWithFindings: 2,
          registeredBindings: 1,
          unregisteredVariables: 1,
        },
      },
      ok: true,
    });
  });

  it("fails closed when no one-file Ready audit scope exists", () => {
    const entry = validRegistry.entries[0];
    if (entry === undefined) throw new Error("Expected Registry entry.");
    const unbuilt = {
      ...validRegistry,
      entries: [
        {
          ...entry,
          figma: {
            channel: entry.figma.channel,
            fileBindingId: entry.figma.fileBindingId,
            majorVersion: entry.figma.majorVersion,
            role: entry.figma.role,
            slotId: entry.figma.slotId,
            status: "unbuilt",
          },
        },
      ],
    };

    expect(createFigmaStyleAuditPlan(snapshot(unbuilt))).toMatchObject({
      error: { code: "IDENTITY_NOT_FOUND" },
      ok: false,
    });
  });
});
