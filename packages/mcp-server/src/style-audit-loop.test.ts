import { resolve } from "node:path";

import type { WriterCommandEnvelope } from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import { loadDesignSystemFromDirectory } from "./registry-files.js";
import { runStyleAuditLoop } from "./style-audit-loop.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const REQUEST_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";

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
    commandType: "audit.styles.scan",
    completedAt: "2026-09-01T21:00:01.000Z",
    dispatchedAt: "2026-09-01T21:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: REQUEST_ID,
    projectId: "hatch-demo",
    queuedAt: "2026-09-01T21:00:00.000Z",
    result: {
      findings: [
        {
          actual: { bindingVariableId: null, value: "12px" },
          code: "HARD_CODED_STYLE",
          expected: { registeredVariableRequired: true },
          field: "paddingLeft",
          kind: "dimension",
          node: { id: "3:4", name: "One-off card", type: "FRAME" },
          recoveryInstruction:
            "Replace the direct value with an approved registered Variable binding.",
          severity: "error",
        },
      ],
      page: { id: "1:2", name: "Settings" },
      passed: false,
      schemaVersion: "1.0.0",
      scope: "current-page",
      summary: {
        auditedStyles: 2,
        hardCodedStyles: 1,
        nodesWithFindings: 1,
        registeredBindings: 1,
        unregisteredVariables: 0,
      },
      type: "audit.styles.scan",
    },
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: "hatch-demo/figma-file/library",
  };
}

describe("style audit Agent loop", () => {
  it("builds the Git allowlist and returns exact Figma finding evidence", async () => {
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
    const result = await runStyleAuditLoop(
      await snapshot(),
      { requestId: REQUEST_ID },
      { expectedProjectId: "hatch-demo", writer: { execute } },
    );

    expect(result).toMatchObject({
      data: {
        audit: {
          findings: [
            {
              code: "HARD_CODED_STYLE",
              field: "paddingLeft",
              node: { id: "3:4", name: "One-off card" },
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
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      approval: {
        mode: "not_required",
        reason: "read_only_diagnostic",
      },
      command: {
        payload: {
          plan: {
            fileBindingId: "00000000-0000-4000-8000-000000000001",
            scope: "current-page",
          },
        },
        type: "audit.styles.scan",
      },
      idempotencyKey: `style-audit:${REQUEST_ID}`,
      operationId: REQUEST_ID,
    });
    const delivery = execute.mock.calls[0]?.[0];
    if (delivery?.command.type !== "audit.styles.scan") {
      throw new Error("Expected an audit.styles.scan command.");
    }
    expect(delivery.command.payload.plan.registeredVariables).toContainEqual(
      expect.objectContaining({
        tokenPath: "semantic/color/action-primary-background",
      }),
    );
  });
});
