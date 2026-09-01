import { resolve } from "node:path";

import type { WriterCommandEnvelope } from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import { loadDesignSystemFromDirectory } from "./registry-files.js";
import { runRegistryDriftAuditLoop } from "./registry-drift-audit-loop.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const REQUEST_ID = "7c73620e-29b0-4285-8861-1a65b18f11dc";

async function snapshot() {
  const loaded = await loadDesignSystemFromDirectory({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
  });
  if (!loaded.ok) throw new Error(loaded.error.message);
  return loaded.data;
}

function operation(): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: "audit.registry-drift.scan",
    completedAt: "2026-09-01T22:00:01.000Z",
    dispatchedAt: "2026-09-01T22:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: REQUEST_ID,
    projectId: "hatch-demo",
    queuedAt: "2026-09-01T22:00:00.000Z",
    result: {
      findings: [
        {
          actual: { present: false },
          code: "REGISTRY_ASSET_MISSING_IN_FIGMA",
          expected: { present: true },
          kind: "component-set",
          physicalId: null,
          recoveryInstruction:
            "Run the approved ensure workflow before using this Registry asset.",
          severity: "error",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
      ],
      passed: false,
      schemaVersion: "1.0.0",
      scope: "entire-file",
      summary: {
        auditedFigmaAssets: 1,
        duplicateAssets: 0,
        invalidMarkers: 0,
        locatorMismatches: 0,
        mismatchedChildren: 0,
        mismatchedDigests: 0,
        mismatchedVersions: 0,
        missingInFigma: 1,
        missingInRegistry: 0,
      },
      type: "audit.registry-drift.scan",
    },
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: "hatch-demo/figma-file/library",
  };
}

describe("Registry drift audit Agent loop", () => {
  it("builds the entire-file Git plan and returns exact Figma drift", async () => {
    const execute = vi.fn<
      (command: WriterCommandEnvelope) => Promise<{
        data: WriterOperation;
        ok: true;
        schemaVersion: "1.0.0";
        warnings: [];
      }>
    >(() =>
      Promise.resolve({
        data: operation(),
        ok: true,
        schemaVersion: "1.0.0",
        warnings: [],
      }),
    );
    const result = await runRegistryDriftAuditLoop(
      await snapshot(),
      { requestId: REQUEST_ID },
      { expectedProjectId: "hatch-demo", writer: { execute } },
    );

    expect(result).toMatchObject({
      data: {
        audit: {
          findings: [{ code: "REGISTRY_ASSET_MISSING_IN_FIGMA" }],
          passed: false,
        },
        operation: { operationId: REQUEST_ID, status: "succeeded" },
        status: "violations-found",
      },
      ok: true,
    });
    const delivery = execute.mock.calls[0]?.[0];
    expect(delivery).toMatchObject({
      approval: { mode: "not_required", reason: "read_only_diagnostic" },
      command: { type: "audit.registry-drift.scan" },
      idempotencyKey: `registry-drift-audit:${REQUEST_ID}`,
      operationId: REQUEST_ID,
    });
    if (delivery?.command.type !== "audit.registry-drift.scan") {
      throw new Error("Expected audit.registry-drift.scan.");
    }
    expect(delivery.command.payload.plan).toMatchObject({
      scope: "entire-file",
      tokenCollections: [{ assetId: "button-foundation" }],
      componentSets: [
        {
          assetId: "button",
          componentSetKey: "fixture_button_component_set_key_0001",
          nodeId: "100:200",
        },
      ],
    });
    expect(
      delivery.command.payload.plan.tokenCollections[0]?.variableStableIds,
    ).toHaveLength(30);
    expect(
      delivery.command.payload.plan.componentSets[0]?.variantStableIds,
    ).toHaveLength(4);
  });
});
