import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  createInitialWriterStatus,
  isUiToMainMessage,
  type WriterContextMessage,
  type WriterResultMessage,
  type WriterStatusMessage,
} from "./status-model.js";
import {
  canonicalizeJson,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";
import { FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION } from "./writer-message-validation.js";

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 568;

function currentStatusMessage(): WriterStatusMessage {
  return {
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    snapshot: createInitialWriterStatus({
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
    }),
    type: "writer.status",
  };
}

function publishStatus(): void {
  figma.ui.postMessage(currentStatusMessage());
}

function currentContextMessage(): WriterContextMessage {
  return {
    context: {
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
    },
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "writer.context",
  };
}

interface CompletedCommand {
  readonly fingerprint: string;
  readonly result: WriterPluginResult;
}

const completedCommands = new Map<string, CompletedCommand>();
const MAX_COMPLETED_COMMANDS = 100;

function commandFingerprint(command: WriterCommandDelivery): string {
  return canonicalizeJson({
    approval: command.approval,
    command: command.command,
    projectId: command.projectId,
    schemaVersion: command.schemaVersion,
    target: command.target,
  });
}

function rememberCompleted(
  command: WriterCommandDelivery,
  result: WriterPluginResult,
): void {
  completedCommands.set(command.operationId, {
    fingerprint: commandFingerprint(command),
    result,
  });
  if (completedCommands.size > MAX_COMPLETED_COMMANDS) {
    const oldest = completedCommands.keys().next().value;
    if (typeof oldest === "string") {
      completedCommands.delete(oldest);
    }
  }
}

function executeCommand(
  command: WriterCommandDelivery,
  pluginInstanceId: string,
): WriterPluginResult {
  const fingerprint = commandFingerprint(command);
  const completed = completedCommands.get(command.operationId);
  if (completed !== undefined) {
    if (completed.fingerprint === fingerprint) {
      return { ...completed.result, pluginInstanceId };
    }
    return {
      error: {
        code: "OPERATION_ID_CONFLICT",
        message: "The operation ID was reused for a different Writer Command.",
        recoveryInstruction:
          "Reject the command and resubmit it with a new operation ID.",
      },
      ok: false,
      operationId: command.operationId,
      pluginInstanceId,
      schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
    };
  }

  const result: WriterPluginResult = {
    ok: true,
    operationId: command.operationId,
    pluginInstanceId,
    result: { pong: true },
    schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
  };
  rememberCompleted(command, result);
  return result;
}

function publishResult(result: WriterPluginResult): void {
  const message: WriterResultMessage = {
    result,
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "writer.result",
  };
  figma.ui.postMessage(message);
}

figma.showUI(__html__, {
  height: PANEL_HEIGHT,
  themeColors: true,
  width: PANEL_WIDTH,
});

figma.ui.onmessage = (message: unknown) => {
  if (!isUiToMainMessage(message)) {
    figma.notify("Hatchkit ignored an unsupported UI message.", {
      error: true,
      timeout: 2500,
    });
    return;
  }

  switch (message.type) {
    case "ui.close": {
      figma.closePlugin();
      break;
    }
    case "ui.ready":
      publishStatus();
      break;
    case "ui.refresh": {
      figma.ui.postMessage(currentContextMessage());
      break;
    }
    case "writer.execute": {
      publishResult(executeCommand(message.command, message.pluginInstanceId));
      break;
    }
  }
};

figma.on("currentpagechange", () => {
  figma.ui.postMessage(currentContextMessage());
});
