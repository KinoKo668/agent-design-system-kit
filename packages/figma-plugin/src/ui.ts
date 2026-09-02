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
  FILE_BINDING_CONFIRMATION,
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
import type { FigmaLibraryFileBinding } from "./variables-writer.js";

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required UI element '${id}' was not found.`);
  }
  return element as T;
}

function randomUuid(): string {
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
const bindingBadge = requiredElement<HTMLElement>("binding-badge");
const bindingDetail = requiredElement<HTMLElement>("binding-detail");
const bindingProjectInput =
  requiredElement<HTMLInputElement>("binding-project-id");
const bindingIdInput = requiredElement<HTMLInputElement>("binding-file-id");
const generateBindingIdButton = requiredElement<HTMLButtonElement>(
  "generate-binding-id",
);
const bindFileButton = requiredElement<HTMLButtonElement>("bind-file");
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

const instanceId = randomUuid();
let snapshot = createInitialWriterStatus({
  fileName: "Reading Figma…",
  pageName: "Reading Figma…",
});
let fileBinding: FigmaLibraryFileBinding | null = null;
let fileBindingError: PluginErrorView | null = null;
let fileBindingPending = false;
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

function bindingDraftIsValid(): boolean {
  const projectId = bindingProjectInput.value.trim();
  return (
    projectId.length <= 64 &&
    /^[a-z][a-z0-9-]*$/u.test(projectId) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      bindingIdInput.value.trim(),
    )
  );
}

function renderFileBinding(): void {
  const operationBusy =
    snapshot.operation.status === "queued" ||
    snapshot.operation.status === "running";
  if (fileBinding !== null) {
    bindingBadge.dataset.tone = "success";
    bindingBadge.textContent = "Bound";
    bindingDetail.textContent =
      "This document is permanently identified as the project design-system library.";
    bindingProjectInput.value = fileBinding.projectId;
    bindingIdInput.value = fileBinding.fileBindingId;
  } else if (fileBindingError !== null) {
    bindingBadge.dataset.tone = "danger";
    bindingBadge.textContent = "Invalid";
    bindingDetail.textContent = `${fileBindingError.message} Next: ${fileBindingError.recoveryInstruction}`;
  } else if (fileBindingPending) {
    bindingBadge.dataset.tone = "info";
    bindingBadge.textContent = "Binding";
    bindingDetail.textContent =
      "Writing the confirmed project identity to this Figma document.";
  } else {
    bindingBadge.dataset.tone = "warning";
    bindingBadge.textContent = "Unbound";
    bindingDetail.textContent =
      "Confirm a stable project ID and generated file ID before any library write.";
  }

  const locked =
    fileBinding !== null || fileBindingError !== null || fileBindingPending;
  bindingProjectInput.disabled = locked;
  bindingIdInput.disabled = locked;
  generateBindingIdButton.disabled = locked || operationBusy;
  bindFileButton.disabled = locked || operationBusy || !bindingDraftIsValid();
}

function render(): void {
  contextFile.textContent = snapshot.context.fileName;
  contextPage.textContent = snapshot.context.pageName;
  renderFileBinding();
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
    const timer = setTimeout(
      () => {
        pendingResults.delete(command.operationId);
        reject(new Error("Figma main thread did not return a Writer Result."));
      },
      command.command.type === "writer.ping" ? 5_000 : 30_000,
    );
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
  const variablesCommand = command.command.type === "variables.ensure";
  const buttonCommand = command.command.type === "components.button.ensure";
  const iconCommand = command.command.type === "components.icon.ensure";
  const instanceCommand = command.command.type === "instances.button.insert";
  const iconInstanceCommand = command.command.type === "instances.icon.insert";
  const writeCommand =
    variablesCommand ||
    buttonCommand ||
    iconCommand ||
    instanceCommand ||
    iconInstanceCommand;
  const totalSteps = variablesCommand
    ? 5
    : buttonCommand
      ? 7
      : iconCommand
        ? 6
        : instanceCommand
          ? 4
          : iconInstanceCommand
            ? 4
            : 1;
  update({
    approval: writeCommand
      ? command.approval.mode === "approved"
        ? {
            approvalId: command.approval.approvalId,
            detail: `The command carries an approved ${command.approval.subject.type} version and digest.`,
            status: "approved",
            subject: `${command.approval.subject.assetId}@${command.approval.subject.assetVersion}`,
          }
        : {
            detail: "The write command is missing an approved source record.",
            status: "blocked",
          }
      : snapshot.approval,
    error: null,
    operation: {
      completedSteps: 0,
      detail: writeCommand
        ? `The Figma main thread is preflighting the approved ${variablesCommand ? "Variable" : instanceCommand ? "Button Instance" : iconInstanceCommand ? "Icon Instance" : iconCommand ? "Icon" : "Button"} plan.`
        : "The Figma main thread is validating a diagnostic command.",
      operationId: command.operationId,
      status: "running",
      step: writeCommand
        ? `Verify file, identities, ${variablesCommand ? "Modes" : instanceCommand ? "Registry locator and Variant" : "Token dependencies"} and conflicts`
        : "Validate writer.ping",
      totalSteps,
    },
    writeAuthorized: writeCommand && command.approval.mode === "approved",
  });
  const result = await waitForMainResult(command);
  const acceptance = await client.report(result);
  if (acceptance.status !== "succeeded") {
    const acceptedError = acceptance.error;
    if (acceptedError === null) {
      throw new Error("Bridge finalization failed without recovery details.");
    }
    update({
      error: acceptedError,
      operation: {
        completedSteps: Math.min(
          result.ok
            ? totalSteps - 1
            : (result.error.completedSteps?.length ?? 0),
          totalSteps,
        ),
        detail:
          acceptance.status === "partial"
            ? "Figma completed, but the local Registry still needs recovery."
            : "The Writer Operation failed safely.",
        operationId: command.operationId,
        status: "failed",
        step: "Review the structured recovery instruction",
        totalSteps,
      },
      writeAuthorized: false,
    });
    return;
  }
  if (result.ok) {
    const variablesResult =
      "type" in result.result && result.result.type === "variables.ensure"
        ? result.result
        : null;
    const buttonResult =
      "type" in result.result &&
      result.result.type === "components.button.ensure"
        ? result.result
        : null;
    const iconResult =
      "type" in result.result && result.result.type === "components.icon.ensure"
        ? result.result
        : null;
    const instanceResult =
      "type" in result.result &&
      result.result.type === "instances.button.insert"
        ? result.result
        : null;
    const iconInstanceResult =
      "type" in result.result && result.result.type === "instances.icon.insert"
        ? result.result
        : null;
    update({
      operation: {
        completedSteps: totalSteps,
        detail:
          variablesResult !== null
            ? `${String(variablesResult.variables.created)} created, ${String(variablesResult.variables.updated)} updated, ${String(variablesResult.variables.unchanged)} unchanged.`
            : buttonResult !== null
              ? `${String(buttonResult.variants.created)} Variants created, ${String(buttonResult.variants.updated)} updated, ${String(buttonResult.variants.unchanged)} unchanged.`
              : iconResult !== null
                ? `${String(iconResult.variants.created)} Icon Variants created, ${String(iconResult.variants.updated)} updated, ${String(iconResult.variants.unchanged)} unchanged.`
                : instanceResult !== null
                  ? `Button Instance ${instanceResult.instance.action} from the registered ${instanceResult.variant.stableId}.`
                  : iconInstanceResult !== null
                    ? `Icon Instance ${iconInstanceResult.instance.action} from the registered ${iconInstanceResult.variant.stableId}.`
                    : "The diagnostic round trip completed without a Figma write.",
        operationId: command.operationId,
        status: "succeeded",
        step:
          variablesResult !== null
            ? "Variables audited and managed markers committed"
            : buttonResult !== null
              ? "Button Component Set audited and managed markers committed"
              : iconResult !== null
                ? "Icon Component Set audited and managed markers committed"
                : instanceResult !== null
                  ? "Button Instance audited and managed marker committed"
                  : iconInstanceResult !== null
                    ? "Icon Instance audited and managed marker committed"
                    : "writer.ping acknowledged",
        totalSteps,
      },
      writeAuthorized: false,
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
      completedSteps: Math.min(
        result.error.completedSteps?.length ?? 0,
        totalSteps,
      ),
      detail: variablesCommand
        ? "The Variables command stopped with a structured failure."
        : iconCommand
          ? "The Icon command stopped with a structured failure."
          : iconInstanceCommand
            ? "The Icon Instance command stopped with a structured failure."
            : buttonCommand || instanceCommand
              ? "The Button command stopped with a structured failure."
              : "The diagnostic command failed safely.",
      operationId: command.operationId,
      status: "failed",
      step: "Review the structured error",
      totalSteps,
    },
    writeAuthorized: false,
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
    case "file.binding": {
      fileBinding = message.binding;
      fileBindingError = message.error;
      fileBindingPending = false;
      render();
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
bindingProjectInput.addEventListener("input", render);
bindingIdInput.addEventListener("input", render);
generateBindingIdButton.addEventListener("click", () => {
  bindingIdInput.value = randomUuid();
  render();
  bindingProjectInput.focus();
});
bindFileButton.addEventListener("click", () => {
  const projectId = bindingProjectInput.value.trim();
  const fileBindingId = bindingIdInput.value.trim().toLowerCase();
  if (!bindingDraftIsValid()) {
    bindingDetail.textContent =
      "Use a kebab-case project ID and generate a valid file UUID.";
    bindingBadge.dataset.tone = "danger";
    bindingBadge.textContent = "Check input";
    return;
  }
  const confirmed = window.confirm(
    `Bind “${snapshot.context.fileName}” to project “${projectId}”?\n\nThis identity blocks writes meant for other files. Changing it later requires a separately reviewed rebind flow.`,
  );
  if (!confirmed) return;
  fileBindingPending = true;
  render();
  postMessage({
    binding: {
      fileBindingId,
      fileRole: "design-system-library",
      projectId,
      schemaVersion: "1.0.0",
    },
    confirmation: FILE_BINDING_CONFIRMATION,
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "file.bind",
  });
});
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
