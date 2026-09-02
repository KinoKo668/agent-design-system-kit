import { resolve } from "node:path";

import { componentRegistrySchema } from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import { runIconInstanceLoop } from "./icon-instance-loop.js";
import type { LocalWriterClient } from "./local-writer-client.js";
import { loadDesignSystemFromDirectory } from "./registry-files.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const REQUEST_ID = "3c73620e-29b0-4285-8861-1a65b18f11dc";

async function snapshot(ready = false) {
  const loaded = await loadDesignSystemFromDirectory({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
  });
  if (!loaded.ok) throw new Error(loaded.error.message);
  if (!ready) return loaded.data;

  return {
    ...loaded.data,
    registries: loaded.data.registries.map((located) => {
      const entry = located.data.entries.find(
        ({ asset }) => asset.id === "icon/check",
      );
      if (entry === undefined) return located;
      return {
        ...located,
        data: componentRegistrySchema.parse({
          ...located.data,
          entries: located.data.entries.map((candidate) =>
            candidate.asset.id === "icon/check"
              ? {
                  ...candidate,
                  figma: {
                    appliedDigest: candidate.asset.contentDigest,
                    appliedVersion: candidate.asset.version,
                    channel: candidate.figma.channel,
                    fileBindingId: candidate.figma.fileBindingId,
                    locator: {
                      componentSetKey: "icon-check-component-set-key",
                      nodeId: "500:600",
                    },
                    majorVersion: candidate.figma.majorVersion,
                    role: "component-set",
                    slotId: "root",
                    status: "ready",
                  },
                }
              : candidate,
          ),
        }),
      };
    }),
  };
}

function request() {
  return {
    assetId: "icon/check",
    instanceId: "checkout/success-check",
    requestId: REQUEST_ID,
    variantSelections: { size: "large" },
    x: 180,
    y: 260,
  } as const;
}

function succeededOperation(): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: "instances.icon.insert",
    completedAt: "2026-09-01T20:00:01.000Z",
    dispatchedAt: "2026-09-01T20:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: REQUEST_ID,
    projectId: "hatch-demo",
    queuedAt: "2026-09-01T20:00:00.000Z",
    result: {
      componentSet: {
        nodeId: "500:600",
        stableId: "hatch-demo/component/icon/check/component-set/major-1",
      },
      instance: {
        action: "created",
        nodeId: "600:700",
        stableId: "hatch-demo/instance/checkout/success-check",
      },
      type: "instances.icon.insert",
      variant: {
        stableId:
          "hatch-demo/component/icon/check/component-set/major-1/variant/size-large",
      },
    },
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: "hatch-demo/figma-file/library",
  };
}

describe("Icon Instance Agent loop", () => {
  it("resolves one Ready Size and submits a deterministic approved command", async () => {
    const execute = vi.fn<LocalWriterClient["execute"]>(() =>
      Promise.resolve({
        data: succeededOperation(),
        ok: true as const,
        schemaVersion: "1.0.0" as const,
        warnings: [],
      }),
    );
    const options = {
      expectedProjectId: "hatch-demo",
      writer: { execute },
    };

    const first = await runIconInstanceLoop(
      await snapshot(true),
      request(),
      options,
    );
    const second = await runIconInstanceLoop(
      await snapshot(true),
      request(),
      options,
    );

    expect(first).toMatchObject({
      data: {
        operation: {
          action: "created",
          instanceNodeId: "600:700",
          operationId: REQUEST_ID,
        },
        resolution: {
          approvalId: "approval.component.icon.check.1.0.0",
          assetId: "icon/check",
          componentSetNodeId: "500:600",
          selectedVariantId:
            "hatch-demo/component/icon/check/component-set/major-1/variant/size-large",
          variantSelections: { size: "large" },
        },
        status: "inserted",
      },
      ok: true,
    });
    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual(execute.mock.calls[1]?.[0]);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      command: {
        payload: {
          plan: {
            instance: {
              stableId: "hatch-demo/instance/checkout/success-check",
            },
            properties: { size: { name: "Size", value: "Large" } },
          },
        },
        type: "instances.icon.insert",
      },
      idempotencyKey: `icon-instance:${REQUEST_ID}`,
      operationId: REQUEST_ID,
    });
  });

  it("keeps an Unbuilt public Icon and invalid Size before the Writer boundary", async () => {
    const execute = vi.fn();
    const options = {
      expectedProjectId: "hatch-demo",
      writer: { execute },
    };
    expect(
      await runIconInstanceLoop(await snapshot(), request(), options),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      await runIconInstanceLoop(
        await snapshot(true),
        { ...request(), variantSelections: { size: "huge" } },
        options,
      ),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(execute).not.toHaveBeenCalled();
  });
});
