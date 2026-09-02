import { resolve } from "node:path";

import { componentRegistrySchema } from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import { runInputInstanceLoop } from "./input-instance-loop.js";
import type { LocalWriterClient } from "./local-writer-client.js";
import { loadDesignSystemFromDirectory } from "./registry-files.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const REQUEST_ID = "4c73620e-29b0-4285-8861-1a65b18f11dc";

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
        ({ asset }) => asset.id === "input/text",
      );
      if (entry === undefined) return located;
      return {
        ...located,
        data: componentRegistrySchema.parse({
          ...located.data,
          entries: located.data.entries.map((candidate) =>
            candidate.asset.id === "input/text"
              ? {
                  ...candidate,
                  figma: {
                    ...candidate.figma,
                    appliedDigest: candidate.asset.contentDigest,
                    appliedVersion: candidate.asset.version,
                    locator: {
                      componentSetKey: "input-text-component-set-key",
                      nodeId: "700:800",
                    },
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
    assetId: "input/text",
    instanceId: "sign-up/email",
    label: "Email address",
    requestId: REQUEST_ID,
    supportingText: "Enter a valid work email address.",
    text: "alex@example.com",
    variantSelections: { content: "filled", state: "error" },
    x: 120,
    y: 240,
  } as const;
}

function succeededOperation(): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: "instances.input.insert",
    completedAt: "2026-09-01T20:00:01.000Z",
    dispatchedAt: "2026-09-01T20:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: REQUEST_ID,
    projectId: "hatch-demo",
    queuedAt: "2026-09-01T20:00:00.000Z",
    result: {
      componentSet: {
        nodeId: "700:800",
        stableId: "hatch-demo/component/input/text/component-set/major-1",
      },
      instance: {
        action: "created",
        nodeId: "800:900",
        stableId: "hatch-demo/instance/sign-up/email",
      },
      type: "instances.input.insert",
      variant: {
        stableId:
          "hatch-demo/component/input/text/component-set/major-1/variant/state-error/content-filled",
      },
    },
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: "hatch-demo/figma-file/library",
  };
}

describe("Input Instance Agent loop", () => {
  it("resolves one Ready Variant and submits an exact deterministic command", async () => {
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
    const first = await runInputInstanceLoop(
      await snapshot(true),
      request(),
      options,
    );
    const second = await runInputInstanceLoop(
      await snapshot(true),
      request(),
      options,
    );

    expect(first).toMatchObject({
      data: {
        operation: {
          action: "created",
          instanceNodeId: "800:900",
          operationId: REQUEST_ID,
        },
        resolution: {
          approvalId: "approval.component.input.text.1.0.0",
          assetId: "input/text",
          componentSetNodeId: "700:800",
          selectedVariantId:
            "hatch-demo/component/input/text/component-set/major-1/variant/state-error/content-filled",
          variantSelections: { content: "filled", state: "error" },
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
            instance: { stableId: "hatch-demo/instance/sign-up/email" },
            properties: {
              content: { name: "Content", value: "Filled" },
              label: { name: "Label", value: "Email address" },
              state: { name: "State", value: "Error" },
              supportingText: {
                name: "Supporting text",
                value: "Enter a valid work email address.",
              },
              text: { name: "Text", value: "alex@example.com" },
            },
          },
        },
        type: "instances.input.insert",
      },
      idempotencyKey: `input-instance:${REQUEST_ID}`,
      operationId: REQUEST_ID,
    });
  });

  it("keeps Unbuilt or unsafe requests before the Writer boundary", async () => {
    const execute = vi.fn();
    const options = {
      expectedProjectId: "hatch-demo",
      writer: { execute },
    };
    expect(
      await runInputInstanceLoop(await snapshot(), request(), options),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      await runInputInstanceLoop(
        await snapshot(true),
        { ...request(), text: " padded " },
        options,
      ),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(execute).not.toHaveBeenCalled();
  });
});
