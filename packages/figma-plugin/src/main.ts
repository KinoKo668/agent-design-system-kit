import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  createInitialWriterStatus,
  isUiToMainMessage,
  type FigmaFileBindingMessage,
  type WriterContextMessage,
  type WriterResultMessage,
  type WriterStatusMessage,
} from "./status-model.js";
import {
  ERROR_DEFINITIONS,
  canonicalizeJson,
  type ErrorCode,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";
import { FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION } from "./writer-message-validation.js";
import { createFigmaVariablesPort } from "./figma-variables-port.js";
import {
  bindFigmaLibraryFile,
  ensureFigmaVariables,
  getFigmaLibraryFileBinding,
  VariablesWriterError,
  type FigmaLibraryFileBinding,
} from "./variables-writer.js";

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

function fileBindingError(
  cause: VariablesWriterError,
): FigmaFileBindingMessage {
  const definition = ERROR_DEFINITIONS[cause.code];
  return {
    binding: null,
    error: {
      category: definition.category,
      code: cause.code,
      message: cause.message,
      recoveryInstruction: cause.recoveryInstruction,
      retry: definition.retry,
    },
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "file.binding",
  };
}

function currentFileBindingMessage(): FigmaFileBindingMessage {
  try {
    return {
      binding: getFigmaLibraryFileBinding(variablesPort.document),
      error: null,
      schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
      type: "file.binding",
    };
  } catch (cause) {
    return cause instanceof VariablesWriterError
      ? fileBindingError(cause)
      : fileBindingError(
          new VariablesWriterError({
            code: "INTERNAL_ERROR",
            message: "The Figma file binding could not be inspected.",
            recoveryInstruction:
              "Restart the Plugin and inspect its local diagnostics before binding or writing.",
          }),
        );
  }
}

function publishFileBinding(): void {
  figma.ui.postMessage(currentFileBindingMessage());
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
const variablesPort = createFigmaVariablesPort(figma);
let executionChain: Promise<void> = Promise.resolve();

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

function failureResult(
  command: WriterCommandDelivery,
  pluginInstanceId: string,
  input: {
    readonly code: ErrorCode;
    readonly completedSteps?: readonly string[];
    readonly message: string;
    readonly recoveryInstruction: string;
  },
): WriterPluginResult {
  return {
    error: {
      code: input.code,
      ...(input.completedSteps === undefined
        ? {}
        : { completedSteps: [...input.completedSteps] }),
      message: input.message.slice(0, 1024),
      recoveryInstruction: input.recoveryInstruction.slice(0, 1024),
    },
    ok: false,
    operationId: command.operationId,
    pluginInstanceId,
    schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
  };
}

async function executeCommand(
  command: WriterCommandDelivery,
  pluginInstanceId: string,
): Promise<WriterPluginResult> {
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

  let result: WriterPluginResult;
  if (command.command.type === "writer.ping") {
    result = {
      ok: true,
      operationId: command.operationId,
      pluginInstanceId,
      result: { pong: true },
      schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
    };
  } else if (
    command.approval.mode === "approved" &&
    command.target.kind === "figma-file"
  ) {
    try {
      const variablesResult = await ensureFigmaVariables(
        variablesPort,
        command.command.payload.plan,
        {
          approvalId: command.approval.approvalId,
          fileBindingId: command.target.fileBindingId,
          operationId: command.operationId,
          projectId: command.projectId,
        },
      );
      result = {
        ok: true,
        operationId: command.operationId,
        pluginInstanceId,
        result: variablesResult,
        schemaVersion: FIGMA_WRITER_PROTOCOL_SCHEMA_VERSION,
      };
    } catch (cause) {
      result =
        cause instanceof VariablesWriterError
          ? failureResult(command, pluginInstanceId, cause)
          : failureResult(command, pluginInstanceId, {
              code: "INTERNAL_ERROR",
              message: "The Figma Variables writer failed unexpectedly.",
              recoveryInstruction:
                "Inspect the local Plugin diagnostics and report the failure before retrying.",
            });
    }
  } else {
    result = failureResult(command, pluginInstanceId, {
      code: "APPROVAL_REQUIRED",
      message: "The Variables command has no matching approved Token record.",
      recoveryInstruction:
        "Rebuild the command from the current approved Token Set and bound Figma file.",
    });
  }
  if (
    result.ok ||
    ERROR_DEFINITIONS[result.error.code].retry === "do_not_retry"
  ) {
    rememberCompleted(command, result);
  }
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

function scheduleCommand(
  command: WriterCommandDelivery,
  pluginInstanceId: string,
): void {
  executionChain = executionChain
    .then(async () => {
      publishResult(await executeCommand(command, pluginInstanceId));
    })
    .catch(() => {
      publishResult(
        failureResult(command, pluginInstanceId, {
          code: "INTERNAL_ERROR",
          message: "The Figma Writer could not complete the command.",
          recoveryInstruction:
            "Inspect the local Plugin diagnostics and restart the Writer if necessary.",
        }),
      );
    });
}

function scheduleFileBinding(binding: FigmaLibraryFileBinding): void {
  executionChain = executionChain
    .then(() => {
      const result = bindFigmaLibraryFile(variablesPort.document, binding);
      publishFileBinding();
      figma.notify(
        result.status === "bound"
          ? "This file is now bound as the Hatchkit design-system library."
          : "This file already has the same Hatchkit binding.",
        { timeout: 3000 },
      );
    })
    .catch((cause: unknown) => {
      const error =
        cause instanceof VariablesWriterError
          ? cause
          : new VariablesWriterError({
              code: "INTERNAL_ERROR",
              message: "The Figma file binding could not be completed.",
              recoveryInstruction:
                "Restart the Plugin and inspect its local diagnostics before retrying.",
            });
      figma.ui.postMessage(fileBindingError(error));
      figma.notify(error.message, { error: true, timeout: 3500 });
    });
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
      publishFileBinding();
      break;
    case "ui.refresh": {
      figma.ui.postMessage(currentContextMessage());
      publishFileBinding();
      break;
    }
    case "file.bind": {
      scheduleFileBinding(message.binding);
      break;
    }
    case "writer.execute": {
      scheduleCommand(message.command, message.pluginInstanceId);
      break;
    }
  }
};

figma.on("currentpagechange", () => {
  figma.ui.postMessage(currentContextMessage());
});
