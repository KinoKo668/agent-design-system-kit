import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  approvalPresentation,
  connectionPresentation,
  isMainToUiMessage,
  operationPresentation,
  operationProgressPercent,
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

const contextFile = requiredElement<HTMLElement>("context-file");
const contextPage = requiredElement<HTMLElement>("context-page");
const connectionBadge = requiredElement<HTMLElement>("connection-badge");
const connectionDetail = requiredElement<HTMLElement>("connection-detail");
const connectionEndpoint = requiredElement<HTMLElement>("connection-endpoint");
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

function render(snapshot: WriterStatusSnapshot): void {
  contextFile.textContent = snapshot.context.fileName;
  contextPage.textContent = snapshot.context.pageName;

  setPresentation(
    connectionBadge,
    connectionPresentation(snapshot.connection.status),
  );
  connectionDetail.textContent = snapshot.connection.detail;
  setOptionalText(connectionEndpoint, "Endpoint", snapshot.connection.endpoint);

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
    : "Status only · Figma writes are blocked";
  refreshButton.disabled = false;
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
  render(message.snapshot);
});

refreshButton.addEventListener("click", () => {
  refreshButton.disabled = true;
  postMessage({
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "ui.refresh",
  });
});

closeButton.addEventListener("click", () => {
  postMessage({
    schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
    type: "ui.close",
  });
});

postMessage({
  schemaVersion: FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  type: "ui.ready",
});
