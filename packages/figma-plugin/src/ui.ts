import {
  ERROR_DEFINITIONS,
  type ErrorCode,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

import {
  FIGMA_BRIDGE_ENDPOINT,
  FigmaBridgeClientError,
  createFigmaBridgeClient,
  type FigmaBridgeClient,
} from "./bridge-client.js";
import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  approvalPresentation,
  connectionPresentation,
  createInitialWriterStatus,
  isMainToUiMessage,
  operationPresentation,
  operationProgressPercent,
  type PluginErrorView,
  type StatusPresentation,
  type UiToMainMessage,
  type WriterStatusSnapshot,
} from "./status-model.js";

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required UI element '${id}' was not found.`);
  }
  return element as T;
}

function pluginInstanceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function localError(
  code: ErrorCode,
  message: string,
  recoveryInstruction: string,
): PluginErrorView {
  const definition = ERROR_DEFINITIONS[code];
  return {
    category: definition.category,
    code,
    message,
    recoveryInstruction,
    retry: definition.retry,
  };
}

function errorFrom(cause: unknown): PluginErrorView {
  return cause instanceof FigmaBridgeClientError
    ? cause.view
    : localError(
        "INTERNAL_ERROR",
        "The Writer Plugin could not finish the local operation.",
        "Reconnect the Plugin and retry the same idempotent command.",
      );
}

const contextFile = requiredElement<HTMLElement>("context-file");
const contextPage = requiredElement<HTMLElement>("context-page");
const connectionBadge = requiredElement<HTMLElement>("connection-badge");
const connectionDetail = requiredElement<HTMLElement>("connection-detail");
const connectionEndpoint = requiredElement<HTMLElement>("connection-endpoint");
const tokenInput = requiredElement<HTMLInputElement>("session-token");
const connectButton = requiredElement<HTMLButtonElement>("connect");
const disconnectButton = requiredElement<HTMLButtonElement>("disconnect");
const approvalBadge = requiredElement<HTMLElement>("approval-badge");
const approvalDetail = requiredElement<HTMLElement>("approval-detail");
const approvalReference = requiredElement<HTMLElement>("approval-reference");
const operationBadge = requiredElement<HTMLElement>("operation-badge");
const operationDetail = requiredElement<HTMLElement>("operation-detail");
const operationStep = requiredElement<HTMLElement>("operation-step");
const progressBar = requiredElement<HTMLElement>("operation-progress-bar");
const progressText = requiredElement<HTMLElement>("operation-progress-text");
const errorPanel = requiredElement<HTMLElement>("error-panel");
const errorCode = requiredElement<HTMLElement>("error-code");
const errorMessage = requiredElement<HTMLElement>("error-message");
const errorRecovery = requiredElement<HTMLElement>("error-recovery");
const authorization = requiredElement<HTMLElement>("authorization");
const refreshButton = requiredElement<HTMLButtonElement>("refresh");
const closeButton = requiredElement<HTMLButtonElement>("close");

const instanceId = pluginInstanceId();
let snapshot = createInitialWriterStatus({
  fileName: "Reading Figma…",
  pageName: "Reading Figma…",
});
let bridgeClient: FigmaBridgeClient | null = null;
let connectionGeneration = 0;
const pendingResults = new Map<string, (result: WriterPluginResult) => void>();

function postMessage(message: UiToMainMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function setPresentation(
  element: HTMLElement,
  presentation: StatusPresentation,
): void {
  element.dataset.tone = presentation.tone;
  element.textContent = presentation.label;
}

function setOptionalText(
  element: HTMLElement,
  label: string,
  value: string | undefined,
): void {
  element.hidden = value === undefined;
  element.textContent = value === undefined ? "" : `${label}: ${value}`;
}

function render(): void {
  contextFile.textContent = snapshot.context.fileName;
  contextPage.textContent = snapshot.context.pageName;
  setPresentation(
    connectionBadge,
    connectionPresentation(snapshot.connection.status),
  );
  connectionDetail.textContent = snapshot.connection.detail;
  setOptionalText(connectionEndpoint, "Endpoint", snapshot.connection.endpoint);
  const connected = snapshot.connection.status === "connected";
  const busy =
    snapshot.connection.status === "connecting" ||
    snapshot.connection.status === "reconnecting";
  tokenInput.disabled = connected || busy;
  connectButton.disabled = connected || busy;
  disconnectButton.disabled = !connected && !busy;

  setPresentation(
    approvalBadge,
    approvalPresentation(snapshot.approval.status),
  );
  approvalDetail.textContent = snapshot.approval.detail;
  setOptionalText(approvalReference, "Approval", snapshot.approval.approvalId);
  setPresentation(
    operationBadge,
    operationPresentation(snapshot.operation.status),
  );
  operationDetail.textContent = snapshot.operation.detail;
  setOptionalText(operationStep, "Current step", snapshot.operation.step);
  const percent = operationProgressPercent(snapshot.operation);
  progressBar.style.width = `${String(percent)}%`;
  progressBar.parentElement?.setAttribute("aria-valuenow", String(percent));
  progressText.textContent =
    snapshot.operation.totalSteps > 0
      ? `${String(snapshot.operation.completedSteps)} of ${String(snapshot.operation.totalSteps)} steps`
      : "No active steps";

  errorPanel.hidden = snapshot.error === null;
  if (snapshot.error !== null) {
    errorCode.textContent = snapshot.error.code;
    errorMessage.textContent = snapshot.error.message;
    errorRecovery.textContent = `Next: ${snapshot.error.recoveryInstruction}`;
  } else {
    errorCode.textContent = "";
    errorMessage.textContent = "";
    errorRecovery.textContent = "";
  }
  authorization.dataset.authorized = String(snapshot.writeAuthorized);
  authorization.textContent = snapshot.writeAuthorized
    ? "Write authorized"
    : "Diagnostic only · Figma writes are blocked";
  refreshButton.disabled = false;
}

function update(next: Partial<WriterStatusSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  render();
}

function waitForMainResult(
  command: WriterCommandDelivery,
): Promise<WriterPluginResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResults.delete(command.operationId);
      reject(new Error("Figma main thread did not return a Writer Result."));
    }, 5_000);
    pendingResults.set(command.operationId, (result) => {
      clearTimeout(timer);
      pendingResults.delete(command.operationId);
      resolve(result);
    });
    postMessage({
      command,
      pluginInstanceId: instanceId,
      schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
      type: "writer.execute",
    });
  });
}

async function runCommand(
  client: FigmaBridgeClient,
  command: WriterCommandDelivery,
): Promise<void> {
  update({
    error: null,
    operation: {
      completedSteps: 0,
      detail: "The Figma main thread is validating a diagnostic command.",
      operationId: command.operationId,
      status: "running",
      step: "Validate writer.ping",
      totalSteps: 1,
    },
  });
  const result = await waitForMainResult(command);
  await client.report(result);
  if (result.ok) {
    update({
      operation: {
        completedSteps: 1,
        detail: "The diagnostic round trip completed without a Figma write.",
        operationId: command.operationId,
        status: "succeeded",
        step: "writer.ping acknowledged",
        totalSteps: 1,
      },
    });
    return;
  }
  update({
    error: localError(
      result.error.code,
      result.error.message,
      result.error.recoveryInstruction,
    ),
    operation: {
      completedSteps: 0,
      detail: "The diagnostic command failed safely.",
      operationId: command.operationId,
      status: "failed",
      step: "Review the structured error",
      totalSteps: 1,
    },
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function poll(
  client: FigmaBridgeClient,
  generation: number,
): Promise<void> {
  let reconnectAttempt = 0;
  while (bridgeClient === client && generation === connectionGeneration) {
    try {
      const command = await client.next();
      if (command !== null) {
        await runCommand(client, command);
      }
      reconnectAttempt = 0;
    } catch (cause: unknown) {
      const error = errorFrom(cause);
      if (error.code !== "TRANSPORT_UNAVAILABLE" || reconnectAttempt >= 2) {
        bridgeClient = null;
        update({
          connection: {
            detail: "The local Writer session stopped.",
            endpoint: FIGMA_BRIDGE_ENDPOINT,
            status: "disconnected",
          },
          error,
        });
        return;
      }
      reconnectAttempt += 1;
      update({
        connection: {
          detail: `Bridge unavailable. Reconnect attempt ${String(reconnectAttempt)} of 2.`,
          endpoint: FIGMA_BRIDGE_ENDPOINT,
          status: "reconnecting",
        },
        error,
      });
      await delay(reconnectAttempt === 1 ? 300 : 900);
      if (bridgeClient !== client || generation !== connectionGeneration) {
        return;
      }
      try {
        await client.connect(snapshot.context);
        update({
          connection: {
            detail: "Authenticated local Writer session is active.",
            endpoint: FIGMA_BRIDGE_ENDPOINT,
            status: "connected",
          },
          error: null,
        });
      } catch {
        // The next loop iteration applies the bounded recovery policy.
      }
    }
  }
}

async function connect(): Promise<void> {
  const token = tokenInput.value.trim();
  const generation = ++connectionGeneration;
  update({
    connection: {
      detail: "Authenticating with the loopback-only local Bridge.",
      endpoint: FIGMA_BRIDGE_ENDPOINT,
      status: "connecting",
    },
    error: null,
  });
  try {
    const client = createFigmaBridgeClient({
      pluginInstanceId: instanceId,
      sessionToken: token,
    });
    await client.connect(snapshot.context);
    if (generation !== connectionGeneration) {
      try {
        await client.disconnect();
      } catch {
        // The stale connection must not regain UI ownership.
      }
      return;
    }
    tokenInput.value = "";
    bridgeClient = client;
    update({
      approval: {
        detail: "Read-only diagnostics do not require a write approval.",
        status: "not_checked",
      },
      connection: {
        detail: "Authenticated local Writer session is active.",
        endpoint: FIGMA_BRIDGE_ENDPOINT,
        status: "connected",
      },
      error: null,
    });
    void poll(client, generation);
  } catch (cause: unknown) {
    if (generation !== connectionGeneration) {
      return;
    }
    bridgeClient = null;
    update({
      connection: {
        detail: "The local Writer session could not be established.",
        endpoint: FIGMA_BRIDGE_ENDPOINT,
        status: "disconnected",
      },
      error: errorFrom(cause),
    });
  }
}

async function disconnect(): Promise<void> {
  connectionGeneration += 1;
  const client = bridgeClient;
  bridgeClient = null;
  if (client !== null) {
    try {
      await client.disconnect();
    } catch (cause: unknown) {
      update({ error: errorFrom(cause) });
    }
  }
  update({
    connection: {
      detail: "The local Writer session is disconnected.",
      endpoint: FIGMA_BRIDGE_ENDPOINT,
      status: "disconnected",
    },
    operation: {
      completedSteps: 0,
      detail: "No writer operation is queued.",
      status: "idle",
      totalSteps: 0,
    },
  });
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const eventData = event.data;
  if (
    typeof eventData !== "object" ||
    eventData === null ||
    !("pluginMessage" in eventData)
  ) {
    return;
  }
  const message = eventData.pluginMessage;
  if (!isMainToUiMessage(message)) {
    return;
  }
  switch (message.type) {
    case "writer.status": {
      snapshot = message.snapshot;
      render();
      break;
    }
    case "writer.context": {
      update({ context: message.context });
      break;
    }
    case "writer.result": {
      pendingResults.get(message.result.operationId)?.(message.result);
      break;
    }
  }
});

connectButton.addEventListener("click", () => void connect());
disconnectButton.addEventListener("click", () => void disconnect());
refreshButton.addEventListener("click", () => {
  refreshButton.disabled = true;
  postMessage({
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "ui.refresh",
  });
});
closeButton.addEventListener("click", () => {
  void disconnect().finally(() => {
    postMessage({
      schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
      type: "ui.close",
    });
  });
});

render();
postMessage({
  schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  type: "ui.ready",
});
