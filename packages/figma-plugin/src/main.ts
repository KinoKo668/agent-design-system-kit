import {
  FIGMA_PLUGIN_MESSAGE_SCHEMA_VERSION,
  createInitialWriterStatus,
  isUiToMainMessage,
  type WriterStatusMessage,
} from "./status-model.js";

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
    case "ui.refresh": {
      publishStatus();
      break;
    }
  }
};

figma.on("currentpagechange", publishStatus);
