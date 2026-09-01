import { resolve } from "node:path";

import type { WriterCommandEnvelope } from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import { runComponentAuditLoop } from "./component-audit-loop.js";
import { loadDesignSystemFromDirectory } from "./registry-files.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const REQUEST_ID = "6c73620e-29b0-4285-8861-1a65b18f11dc";

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
    commandType: "audit.components.scan",
    completedAt: "2026-09-01T22:00:01.000Z",
    dispatchedAt: "2026-09-01T22:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: REQUEST_ID,
    projectId: "hatch-demo",
    queuedAt: "2026-09-01T22:00:00.000Z",
    result: {
      findings: [
        {
          actual: { nodeType: "FRAME" },
          code: "DETACHED_OR_APPROXIMATE_COMPONENT",
          expected: { nodeType: "INSTANCE" },
          node: { id: "3:4", name: "Detached Button", type: "FRAME" },
          recoveryInstruction:
            "Replace the detached or approximate node with a real registered Figma Instance.",
          severity: "error",
        },
      ],
      page: { id: "1:2", name: "Checkout" },
      passed: false,
      schemaVersion: "1.0.0",
      scope: "current-page",
      summary: {
        auditedNodes: 1,
        compliantInstances: 0,
        detachedOrApproximate: 1,
        provenanceMismatches: 0,
        unregisteredSources: 0,
        unregisteredVariants: 0,
        variantPropertyMismatches: 0,
      },
      type: "audit.components.scan",
    },
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: "hatch-demo/figma-file/library",
  };
}

describe("component audit Agent loop", () => {
  it("builds exact Git sources and returns Figma provenance findings", async () => {
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
    const result = await runComponentAuditLoop(
      await snapshot(),
      { requestId: REQUEST_ID },
      { expectedProjectId: "hatch-demo", writer: { execute } },
    );

    expect(result).toMatchObject({
      data: {
        audit: {
          findings: [
            {
              code: "DETACHED_OR_APPROXIMATE_COMPONENT",
              node: { id: "3:4" },
            },
          ],
          passed: false,
        },
        operation: { operationId: REQUEST_ID, status: "succeeded" },
        status: "violations-found",
      },
      ok: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    const delivery = execute.mock.calls[0]?.[0];
    expect(delivery).toMatchObject({
      approval: { mode: "not_required", reason: "read_only_diagnostic" },
      command: { type: "audit.components.scan" },
      idempotencyKey: `component-audit:${REQUEST_ID}`,
      operationId: REQUEST_ID,
    });
    if (delivery?.command.type !== "audit.components.scan") {
      throw new Error("Expected audit.components.scan.");
    }
    expect(delivery.command.payload.plan.sources[0]).toMatchObject({
      assetId: "button",
      componentSetStableId: "hatch-demo/component/button/component-set/major-1",
    });
    expect(delivery.command.payload.plan.sources[0]?.variants).toHaveLength(4);
  });
});
