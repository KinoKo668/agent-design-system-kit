import { resolve } from "node:path";

import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";
import { describe, expect, it, vi } from "vitest";

import { runButtonInstanceLoop } from "./button-instance-loop.js";
import { loadDesignSystemFromDirectory } from "./registry-files.js";
import type { LocalWriterClient } from "./local-writer-client.js";

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

function succeededOperation(): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: "instances.button.insert",
    completedAt: "2026-09-01T20:00:01.000Z",
    dispatchedAt: "2026-09-01T20:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: REQUEST_ID,
    projectId: "hatch-demo",
    queuedAt: "2026-09-01T20:00:00.000Z",
    result: {
      componentSet: {
        nodeId: "100:200",
        stableId: "hatch-demo/component/button/component-set/major-1",
      },
      instance: {
        action: "created",
        nodeId: "300:400",
        stableId: "hatch-demo/instance/settings/save-button",
      },
      type: "instances.button.insert",
      variant: {
        stableId:
          "hatch-demo/component/button/component-set/major-1/variant/appearance-secondary/state-disabled",
      },
    },
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: "hatch-demo/figma-file/library",
  };
}

function request() {
  return {
    assetId: "button",
    instanceId: "settings/save-button",
    label: "Save changes",
    requestId: REQUEST_ID,
    variantSelections: { appearance: "secondary", state: "disabled" },
    x: 320,
    y: 240,
  };
}

describe("Button Instance Agent loop", () => {
  it("resolves the Registry and submits one deterministic approved command", async () => {
    const execute = vi.fn<LocalWriterClient["execute"]>(() =>
      Promise.resolve({
        data: succeededOperation(),
        ok: true as const,
        schemaVersion: "1.0.0" as const,
        warnings: [],
      }),
    );
    const writer: LocalWriterClient = { execute };

    const first = await runButtonInstanceLoop(await snapshot(), request(), {
      expectedProjectId: "hatch-demo",
      writer,
    });
    const second = await runButtonInstanceLoop(await snapshot(), request(), {
      expectedProjectId: "hatch-demo",
      writer,
    });

    expect(first).toMatchObject({
      data: {
        audit: {
          approval: "verified-by-bridge",
          component: "audited-by-plugin",
          registry: "ready",
        },
        operation: {
          action: "created",
          instanceNodeId: "300:400",
          operationId: REQUEST_ID,
          status: "succeeded",
        },
        resolution: {
          approvalId: "approval.component.button.1.0.0",
          assetId: "button",
          assetVersion: "1.0.0",
          componentSetNodeId: "100:200",
          fileBindingId: "00000000-0000-4000-8000-000000000001",
          selectedVariantId:
            "hatch-demo/component/button/component-set/major-1/variant/appearance-secondary/state-disabled",
        },
        status: "inserted",
      },
      ok: true,
    });
    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual(execute.mock.calls[1]?.[0]);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      approval: {
        approvalId: "approval.component.button.1.0.0",
        mode: "approved",
      },
      command: {
        payload: {
          plan: {
            instance: {
              stableId: "hatch-demo/instance/settings/save-button",
              x: 320,
              y: 240,
            },
            properties: { label: { value: "Save changes" } },
            selectedVariant: {
              selections: { appearance: "secondary", state: "disabled" },
            },
          },
        },
        type: "instances.button.insert",
      },
      idempotencyKey: `button-instance:${REQUEST_ID}`,
      operationId: REQUEST_ID,
      target: {
        fileBindingId: "00000000-0000-4000-8000-000000000001",
        kind: "figma-file",
      },
    });
  });

  it("blocks invalid Variant capability before the Writer boundary", async () => {
    const execute = vi.fn();
    const result = await runButtonInstanceLoop(
      await snapshot(),
      {
        ...request(),
        variantSelections: { appearance: "danger", state: "default" },
      },
      {
        expectedProjectId: "hatch-demo",
        writer: { execute },
      },
    );

    expect(result).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a mismatched project before planning or writing", async () => {
    const execute = vi.fn();
    const result = await runButtonInstanceLoop(await snapshot(), request(), {
      expectedProjectId: "another-project",
      writer: { execute },
    });

    expect(result).toMatchObject({
      error: { code: "IDENTITY_CONFLICT" },
      ok: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
