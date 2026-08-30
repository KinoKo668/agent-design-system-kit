/* SPIKE-002 Figma-side command executor. No build step by design. */

const PROTOCOL_VERSION = "0.1";
const SHARED_NAMESPACE = "agent_design_system_kit";
const SHARED_KEY = "stable-id";
const MARKER_STABLE_ID = "spike-002/marker/local-bridge";
const MARKER_LABEL_STABLE_ID = "spike-002/marker/local-bridge/label";

let pluginInstanceId = null;
let activeOperationId = null;
const completedResults = new Map();

figma.showUI(__html__, { width: 420, height: 620, themeColors: true });

initialize().catch((error) => {
  figma.ui.postMessage({ type: "fatal-error", error: normalizeError(error) });
});

figma.ui.onmessage = async (message) => {
  if (!message) return;
  if (message.type === "close") {
    figma.closePlugin();
    return;
  }
  if (message.type !== "execute-command") return;

  const envelope = message.command;
  if (completedResults.has(envelope?.operationId)) {
    figma.ui.postMessage({ type: "command-result", result: completedResults.get(envelope.operationId) });
    return;
  }
  if (activeOperationId) {
    figma.ui.postMessage({
      type: "command-result",
      result: failedResult(
        envelope?.operationId || "unknown",
        "PLUGIN_BUSY",
        `Operation ${activeOperationId} is still running.`
      )
    });
    return;
  }

  activeOperationId = envelope?.operationId || "unknown";
  let result;
  try {
    result = await executeCommand(envelope);
  } catch (error) {
    const normalized = normalizeError(error);
    result = failedResult(activeOperationId, normalized.code, normalized.message);
  } finally {
    activeOperationId = null;
  }

  completedResults.set(result.operationId, result);
  if (completedResults.size > 100) completedResults.delete(completedResults.keys().next().value);
  figma.ui.postMessage({ type: "command-result", result });
};

async function initialize() {
  pluginInstanceId = await figma.clientStorage.getAsync("spike-002-plugin-instance-id");
  if (!pluginInstanceId) {
    pluginInstanceId = `figma-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await figma.clientStorage.setAsync("spike-002-plugin-instance-id", pluginInstanceId);
  }
  await figma.currentPage.loadAsync();
  figma.ui.postMessage({
    type: "plugin-ready",
    pluginInstanceId,
    context: {
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
      editorType: figma.editorType
    }
  });
}

async function executeCommand(envelope) {
  validateEnvelope(envelope);
  let result;
  if (envelope.command.type === "bridge.ping") {
    result = {
      pong: true,
      pluginInstanceId,
      fileName: figma.root.name,
      pageName: figma.currentPage.name
    };
  } else if (envelope.command.type === "bridge.create_marker") {
    result = await createOrUpdateMarker(envelope.command.payload || {});
  } else {
    throw codedError("UNSUPPORTED_COMMAND", `Unsupported command: ${envelope.command.type}`);
  }

  return {
    schemaVersion: PROTOCOL_VERSION,
    operationId: envelope.operationId,
    ok: true,
    result
  };
}

function validateEnvelope(envelope) {
  if (!envelope || envelope.schemaVersion !== PROTOCOL_VERSION) {
    throw codedError("SCHEMA_VERSION_MISMATCH", `Expected schemaVersion ${PROTOCOL_VERSION}.`);
  }
  if (typeof envelope.operationId !== "string" || !envelope.operationId) {
    throw codedError("INVALID_OPERATION_ID", "operationId is required.");
  }
  if (!envelope.command || typeof envelope.command.type !== "string") {
    throw codedError("INVALID_COMMAND", "command.type is required.");
  }
}

async function createOrUpdateMarker(payload) {
  await figma.currentPage.loadAsync();
  const frames = figma.currentPage.findAllWithCriteria({ types: ["FRAME"] });
  const stableMatches = frames.filter((node) => getStableId(node) === MARKER_STABLE_ID);
  if (stableMatches.length > 1) {
    throw codedError("IDENTITY_CONFLICT", "More than one SPIKE-002 marker has the same stable identity.");
  }

  let marker = stableMatches[0] || null;
  let adopted = false;
  let created = false;
  if (!marker) {
    const nameMatches = frames.filter((node) => node.name === "SPIKE-002 / Local Bridge Marker");
    if (nameMatches.length > 1) {
      throw codedError("IDENTITY_CONFLICT", "More than one frame uses the SPIKE-002 marker name.");
    }
    marker = nameMatches[0] || figma.createFrame();
    adopted = Boolean(nameMatches[0]);
    created = !adopted;
    marker.name = "SPIKE-002 / Local Bridge Marker";
    setStableId(marker, MARKER_STABLE_ID);
    if (created) figma.currentPage.appendChild(marker);
  }

  marker.layoutMode = "HORIZONTAL";
  marker.primaryAxisSizingMode = "AUTO";
  marker.counterAxisSizingMode = "FIXED";
  marker.resize(marker.width || 240, 64);
  marker.counterAxisAlignItems = "CENTER";
  marker.paddingLeft = 20;
  marker.paddingRight = 20;
  marker.itemSpacing = 8;
  marker.cornerRadius = 12;
  marker.fills = [{ type: "SOLID", color: { r: 79 / 255, g: 70 / 255, b: 229 / 255 } }];

  let label = marker.children.find(
    (node) => node.type === "TEXT" && getStableId(node) === MARKER_LABEL_STABLE_ID
  );
  if (!label) {
    const textNodes = marker.children.filter((node) => node.type === "TEXT");
    if (textNodes.length > 1) {
      throw codedError("IDENTITY_CONFLICT", "The marker contains multiple unregistered text nodes.");
    }
    label = textNodes[0] || figma.createText();
    if (!textNodes[0]) marker.appendChild(label);
    setStableId(label, MARKER_LABEL_STABLE_ID);
  }

  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  label.name = "Label";
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 14;
  label.characters = sanitizeLabel(payload.label);
  label.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

  if (created) {
    marker.x = Math.round(figma.viewport.center.x - marker.width / 2);
    marker.y = Math.round(figma.viewport.center.y - marker.height / 2);
  }
  figma.currentPage.selection = [marker];
  figma.viewport.scrollAndZoomIntoView([marker]);

  return {
    markerStableId: MARKER_STABLE_ID,
    markerNodeId: marker.id,
    label: label.characters,
    created,
    adopted
  };
}

function sanitizeLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  if (!label) return "SPIKE-002 / Local Bridge";
  return label.slice(0, 120);
}

function getStableId(node) {
  return node.getSharedPluginData(SHARED_NAMESPACE, SHARED_KEY);
}

function setStableId(node, value) {
  node.setSharedPluginData(SHARED_NAMESPACE, SHARED_KEY, value);
}

function failedResult(operationId, code, message) {
  return {
    schemaVersion: PROTOCOL_VERSION,
    operationId,
    ok: false,
    error: { code, message }
  };
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeError(error) {
  return {
    code: error?.code || "PLUGIN_ERROR",
    message: error?.message || String(error)
  };
}
