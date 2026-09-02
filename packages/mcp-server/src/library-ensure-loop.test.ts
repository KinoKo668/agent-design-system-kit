import { resolve } from "node:path";

import type {
  WriterCommandEnvelope,
  WriterSuccessResult,
} from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import {
  runComponentEnsureLoop,
  runVariablesEnsureLoop,
} from "./library-ensure-loop.js";
import type { LocalWriterClient } from "./local-writer-client.js";
import { loadDesignSystemFromDirectory } from "./registry-files.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

async function snapshot() {
  const loaded = await loadDesignSystemFromDirectory({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
  });
  if (!loaded.ok) throw new Error(loaded.error.message);
  return loaded.data;
}

function operation(
  command: WriterCommandEnvelope,
  result: WriterSuccessResult,
): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: command.command.type,
    completedAt: "2026-09-02T02:00:01.000Z",
    dispatchedAt: "2026-09-02T02:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: command.operationId,
    projectId: command.projectId,
    queuedAt: "2026-09-02T02:00:00.000Z",
    result,
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: command.target.stableId,
  };
}

function success<T extends WriterOperation>(data: T) {
  return Promise.resolve({
    data,
    ok: true as const,
    schemaVersion: "1.0.0" as const,
    warnings: [],
  });
}

function resultForComponent(
  command: WriterCommandEnvelope,
): WriterSuccessResult {
  if (command.command.type === "components.button.ensure") {
    return {
      componentSet: {
        action: "unchanged",
        nodeId: "100:200",
        stableId: command.command.payload.plan.componentSet.stableId,
      },
      labelPropertyName: "Label#100:201",
      type: command.command.type,
      typography: {
        lineHeightStrategy: "resolved-percent",
        variableBindings: 4,
      },
      variants: { created: 0, unchanged: 4, updated: 0 },
    };
  }
  if (command.command.type === "components.icon.ensure") {
    return {
      componentSet: {
        action: "created",
        nodeId: "500:600",
        stableId: command.command.payload.plan.componentSet.stableId,
      },
      type: command.command.type,
      variants: { created: 3, unchanged: 0, updated: 0 },
    };
  }
  if (command.command.type === "components.input.ensure") {
    return {
      componentSet: {
        action: "created",
        nodeId: "700:800",
        stableId: command.command.payload.plan.componentSet.stableId,
      },
      textPropertyNames: {
        label: "Label#700:801",
        supportingText: "Supporting text#700:803",
        text: "Text#700:802",
      },
      type: command.command.type,
      typography: {
        lineHeightStrategy: "resolved-percent",
        variableBindings: 12,
      },
      variants: { created: 8, unchanged: 0, updated: 0 },
    };
  }
  throw new Error(`Unexpected command '${command.command.type}'.`);
}

const OPTIONS = { expectedProjectId: "hatch-demo" } as const;

describe("Figma library ensure Agent loops", () => {
  it("builds an exact approved Variables command without Agent-supplied security facts", async () => {
    const execute = vi.fn<LocalWriterClient["execute"]>((command) => {
      if (command.command.type !== "variables.ensure") {
        throw new Error("Expected Variables command.");
      }
      return success(
        operation(command, {
          collection: {
            action: "created",
            stableId: command.command.payload.plan.collection.stableId,
          },
          deferredTypographyCount:
            command.command.payload.plan.deferredTypography.length,
          type: "variables.ensure",
          variables: { created: 30, unchanged: 0, updated: 0 },
        }),
      );
    });
    const request = {
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      requestId: "5c73620e-29b0-4285-8861-1a65b18f11dc",
    };
    const first = await runVariablesEnsureLoop(await snapshot(), request, {
      ...OPTIONS,
      writer: { execute },
    });
    const second = await runVariablesEnsureLoop(await snapshot(), request, {
      ...OPTIONS,
      writer: { execute },
    });

    expect(first).toMatchObject({
      data: {
        collection: {
          action: "created",
          stableId: "hatch-demo/token-set/button-foundation/variables/major-1",
        },
        resolution: {
          approvalId: "approval.tokens.button-foundation.1.0.0",
          assetId: "button-foundation",
          fileBindingId: "00000000-0000-4000-8000-000000000001",
        },
        status: "ensured",
      },
      ok: true,
    });
    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual(execute.mock.calls[1]?.[0]);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      approval: {
        approvalId: "approval.tokens.button-foundation.1.0.0",
        subject: { type: "token-set" },
      },
      command: { type: "variables.ensure" },
      idempotencyKey: `variables-ensure:${request.requestId}`,
      operationId: request.requestId,
      target: {
        fileBindingId: "00000000-0000-4000-8000-000000000001",
      },
    });
  });

  it("routes Button, Icon and Input through exact profile-specific plans", async () => {
    const execute = vi.fn<LocalWriterClient["execute"]>((command) =>
      success(operation(command, resultForComponent(command))),
    );
    const cases = [
      {
        assetId: "button",
        assetVersion: "1.0.0",
        commandType: "components.button.ensure",
        profile: "button-v1",
        requestId: "6c73620e-29b0-4285-8861-1a65b18f11dc",
      },
      {
        assetId: "icon/check",
        assetVersion: "1.0.0",
        commandType: "components.icon.ensure",
        profile: "icon-v1",
        requestId: "7c73620e-29b0-4285-8861-1a65b18f11dc",
      },
      {
        assetId: "input/text",
        assetVersion: "1.0.0",
        commandType: "components.input.ensure",
        profile: "input-v1",
        requestId: "8c73620e-29b0-4285-8861-1a65b18f11dc",
      },
    ] as const;
    for (const current of cases) {
      const result = await runComponentEnsureLoop(
        await snapshot(),
        {
          assetId: current.assetId,
          assetVersion: current.assetVersion,
          requestId: current.requestId,
        },
        { ...OPTIONS, writer: { execute } },
      );
      expect(result).toMatchObject({
        data: {
          resolution: {
            assetId: current.assetId,
            commandType: current.commandType,
            fileBindingId: "00000000-0000-4000-8000-000000000001",
            profile: current.profile,
          },
          status: "ensured",
        },
        ok: true,
      });
    }
    expect(execute.mock.calls.map(([command]) => command.command.type)).toEqual(
      cases.map(({ commandType }) => commandType),
    );
    for (const [command] of execute.mock.calls) {
      expect(command.approval).toMatchObject({ mode: "approved" });
      expect(command.target).toMatchObject({
        fileBindingId: "00000000-0000-4000-8000-000000000001",
        kind: "figma-file",
      });
    }
  });

  it("fails before dispatch for unknown identities and malformed requests", async () => {
    const execute = vi.fn();
    const options = { ...OPTIONS, writer: { execute } };
    expect(
      await runVariablesEnsureLoop(
        await snapshot(),
        {
          assetId: "missing-tokens",
          assetVersion: "1.0.0",
          requestId: "9c73620e-29b0-4285-8861-1a65b18f11dc",
        },
        options,
      ),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      await runComponentEnsureLoop(
        await snapshot(),
        {
          assetId: "missing-component",
          assetVersion: "1.0.0",
          requestId: "ac73620e-29b0-4285-8861-1a65b18f11dc",
        },
        options,
      ),
    ).toMatchObject({ error: { code: "IDENTITY_NOT_FOUND" }, ok: false });
    expect(
      await runComponentEnsureLoop(
        await snapshot(),
        {
          assetId: "button",
          approvalId: "agent-must-not-supply-this",
          assetVersion: "1.0.0",
          requestId: "cc73620e-29b0-4285-8861-1a65b18f11dc",
        },
        options,
      ),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a successful Operation carrying the wrong audited result", async () => {
    const execute = vi.fn<LocalWriterClient["execute"]>((command) =>
      success(
        operation(command, {
          componentSet: {
            action: "created",
            nodeId: "500:600",
            stableId: "hatch-demo/component/icon/check/component-set/major-1",
          },
          type: "components.icon.ensure",
          variants: { created: 3, unchanged: 0, updated: 0 },
        }),
      ),
    );
    const result = await runComponentEnsureLoop(
      await snapshot(),
      {
        assetId: "button",
        assetVersion: "1.0.0",
        requestId: "bc73620e-29b0-4285-8861-1a65b18f11dc",
      },
      { ...OPTIONS, writer: { execute } },
    );
    expect(result).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
      ok: false,
    });
  });
});
