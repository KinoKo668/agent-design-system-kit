import { describe, expect, it } from "vitest";

import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
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
