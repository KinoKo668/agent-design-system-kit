import { describe, expect, it } from "vitest";

import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  FILE_BINDING_CONFIRMATION,
  approvalPresentation,
  connectionPresentation,
  createInitialWriterStatus,
  isMainToUiMessage,
  isUiToMainMessage,
  isWriterStatusSnapshot,
  operationPresentation,
  operationProgressPercent,
  type OperationStatusView,
} from "./status-model.js";

describe("Figma Plugin writer status model", () => {
  it("starts disconnected, unapproved, idle, and unable to write", () => {
    const snapshot = createInitialWriterStatus({
      fileName: "Hatchkit Demo",
      pageName: "Components",
    });

    expect(snapshot).toEqual({
      approval: {
        detail: "No approval record has been checked for a write operation.",
        status: "not_checked",
      },
      connection: {
        detail: "Waiting for the local Bridge connection.",
        status: "disconnected",
      },
      context: {
        fileName: "Hatchkit Demo",
        pageName: "Components",
      },
      error: null,
      operation: {
        completedSteps: 0,
        detail: "No writer operation is queued.",
        status: "idle",
        totalSteps: 0,
      },
      writeAuthorized: false,
    });
  });

  it("maps every status to both text and a visual tone", () => {
    expect(connectionPresentation("connected")).toEqual({
      label: "Connected",
      tone: "success",
    });
    expect(connectionPresentation("reconnecting")).toEqual({
      label: "Reconnecting",
      tone: "warning",
    });
    expect(approvalPresentation("blocked")).toEqual({
      label: "Blocked",
      tone: "danger",
    });
    expect(operationPresentation("running")).toEqual({
      label: "Running",
      tone: "info",
    });
  });

  it("clamps operation progress and treats success as complete", () => {
    const operation = (
      overrides: Partial<OperationStatusView>,
    ): OperationStatusView => ({
      completedSteps: 0,
      detail: "Working",
      status: "running",
      totalSteps: 4,
      ...overrides,
    });

    expect(operationProgressPercent(operation({ completedSteps: 1 }))).toBe(25);
    expect(operationProgressPercent(operation({ completedSteps: -2 }))).toBe(0);
    expect(operationProgressPercent(operation({ completedSteps: 9 }))).toBe(
      100,
    );
    expect(operationProgressPercent(operation({ totalSteps: 0 }))).toBe(0);
    expect(
      operationProgressPercent(
        operation({ status: "succeeded", totalSteps: 0 }),
      ),
    ).toBe(100);
  });

  it("accepts only versioned UI messages", () => {
    expect(
      isUiToMainMessage({
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "ui.ready",
      }),
    ).toBe(true);
    expect(
      isUiToMainMessage({
        schemaVersion: "0.1.0",
        type: "ui.ready",
      }),
    ).toBe(false);
    expect(
      isUiToMainMessage({
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "writer.execute",
      }),
    ).toBe(false);
    expect(
      isUiToMainMessage({
        force: true,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "ui.ready",
      }),
    ).toBe(false);

    expect(
      isUiToMainMessage({
        binding: {
          fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
          fileRole: "design-system-library",
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
        },
        confirmation: FILE_BINDING_CONFIRMATION,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "file.bind",
      }),
    ).toBe(true);
    expect(
      isUiToMainMessage({
        binding: {
          fileBindingId: "not-a-uuid",
          fileRole: "design-system-library",
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
        },
        confirmation: FILE_BINDING_CONFIRMATION,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "file.bind",
      }),
    ).toBe(false);
  });

  it("deeply validates Writer execution and result messages", () => {
    const command = {
      approval: { mode: "not_required", reason: "read_only_diagnostic" },
      attempt: 1,
      command: { payload: {}, type: "writer.ping" },
      idempotencyKey: "status-model-ping",
      operationId: "2c73620e-29b0-4285-8861-1a65b18f11dc",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
      source: { client: "mcp-server" },
      target: {
        kind: "plugin-session",
        stableId: "hatch-demo/plugin-session",
      },
    };
    const pluginInstanceId = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";

    expect(
      isUiToMainMessage({
        command,
        pluginInstanceId,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "writer.execute",
      }),
    ).toBe(true);
    expect(
      isUiToMainMessage({
        command: {
          ...command,
          command: { payload: {}, type: "variables.ensure" },
        },
        pluginInstanceId,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "writer.execute",
      }),
    ).toBe(false);
    expect(
      isMainToUiMessage({
        result: {
          ok: true,
          operationId: command.operationId,
          pluginInstanceId,
          result: { pong: true },
          schemaVersion: "1.0.0",
        },
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "writer.result",
      }),
    ).toBe(true);
  });

  it("recognizes only versioned status envelopes from the main thread", () => {
    const snapshot = createInitialWriterStatus({
      fileName: "Demo",
      pageName: "Page 1",
    });

    expect(
      isMainToUiMessage({
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        snapshot,
        type: "writer.status",
      }),
    ).toBe(true);
    expect(
      isMainToUiMessage({
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        snapshot: null,
        type: "writer.status",
      }),
    ).toBe(false);

    expect(
      isMainToUiMessage({
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        snapshot: {
          ...snapshot,
          operation: {
            ...snapshot.operation,
            completedSteps: 2,
            totalSteps: 1,
          },
        },
        type: "writer.status",
      }),
    ).toBe(false);

    expect(
      isMainToUiMessage({
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        snapshot: { ...snapshot, untrusted: true },
        type: "writer.status",
      }),
    ).toBe(false);

    expect(
      isMainToUiMessage({
        binding: null,
        error: null,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "file.binding",
      }),
    ).toBe(true);
    expect(
      isMainToUiMessage({
        binding: {
          fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
          fileRole: "design-system-library",
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
        },
        error: null,
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "file.binding",
      }),
    ).toBe(true);
    expect(
      isMainToUiMessage({
        binding: {
          fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
          fileRole: "design-system-library",
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
        },
        error: {
          category: "identity",
          code: "FILE_BINDING_MISMATCH",
          message: "Invalid binding.",
          recoveryInstruction: "Inspect it.",
          retry: "retry_after_correction",
        },
        schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
        type: "file.binding",
      }),
    ).toBe(false);
  });

  it("requires a connected, approved guard before presenting write authorization", () => {
    const snapshot = createInitialWriterStatus({
      fileName: "Demo",
      pageName: "Page 1",
    });

    expect(isWriterStatusSnapshot({ ...snapshot, writeAuthorized: true })).toBe(
      false,
    );
    expect(
      isWriterStatusSnapshot({
        ...snapshot,
        approval: {
          detail: "Approval record and digest match.",
          status: "approved",
        },
        connection: {
          detail: "Bridge session is active.",
          endpoint: "http://localhost:38451",
          status: "connected",
        },
        writeAuthorized: true,
      }),
    ).toBe(true);
  });

  it("rejects errors that disagree with the shared Core definition", () => {
    const snapshot = createInitialWriterStatus({
      fileName: "Demo",
      pageName: "Page 1",
    });

    expect(
      isWriterStatusSnapshot({
        ...snapshot,
        error: {
          category: "approval",
          code: "TRANSPORT_UNAVAILABLE",
          message: "Bridge unavailable.",
          recoveryInstruction: "Start the local Bridge.",
          retry: "do_not_retry",
        },
      }),
    ).toBe(false);
  });
});
