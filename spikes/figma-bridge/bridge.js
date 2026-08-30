#!/usr/bin/env node

/*
 * SPIKE-002 local bridge.
 *
 * This deliberately uses only Node.js built-ins so the experiment does not
 * decide the production dependency stack before ADR-001.
 */

const crypto = require("node:crypto");
const http = require("node:http");

const PROTOCOL_VERSION = "0.1";
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

function createBridge(options = {}) {
  const host = options.host || "127.0.0.1";
  const requestedPort = Number(options.port ?? 38451);
  const token = options.token || crypto.randomBytes(24).toString("hex");
  const longPollMs = Number(options.longPollMs ?? 12_000);
  const leaseMs = Number(options.leaseMs ?? 5_000);
  const now = options.now || Date.now;

  const operations = new Map();
  const idempotency = new Map();
  const sockets = new Set();
  let queue = [];
  let activePlugin = null;
  let inFlightId = null;
  let pendingPoll = null;
  let actualPort = null;

  const server = http.createServer(async (request, response) => {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const base = `http://${request.headers.host || `${host}:${actualPort || requestedPort}`}`;
    const url = new URL(request.url, base);

    if (request.method === "GET" && url.pathname === "/v1/health") {
      sendJson(response, 200, {
        ok: true,
        schemaVersion: PROTOCOL_VERSION,
        pluginConnected: Boolean(activePlugin),
        transport: activePlugin?.transport || null,
        queued: queue.length,
        inFlight: inFlightId
      });
      return;
    }

    if (!isAuthorized(request, token)) {
      sendError(response, 401, "UNAUTHORIZED", "A valid local session token is required.");
      return;
    }

    try {
      if (request.method === "POST" && url.pathname === "/v1/plugin/connect") {
        const body = await readJson(request);
        const error = validatePluginHello(body, "http");
        if (error) {
          sendError(response, 400, "INVALID_PLUGIN_HELLO", error);
          return;
        }
        if (!claimPlugin(body.pluginInstanceId, "http", body.context || null, null)) {
          sendError(response, 409, "WRITER_ALREADY_CONNECTED", "Another plugin instance owns the writer session.");
          return;
        }
        sendJson(response, 200, connectionSnapshot());
        dispatch();
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/plugin/disconnect") {
        const body = await readJson(request);
        if (activePlugin?.pluginInstanceId === body.pluginInstanceId) {
          releaseActivePlugin("explicit_disconnect");
        }
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/plugin/next") {
        const pluginInstanceId = url.searchParams.get("pluginInstanceId");
        if (
          !activePlugin ||
          activePlugin.transport !== "http" ||
          activePlugin.pluginInstanceId !== pluginInstanceId
        ) {
          sendError(response, 409, "PLUGIN_SESSION_MISMATCH", "Connect this HTTP plugin instance before polling.");
          return;
        }
        activePlugin.lastSeenAt = now();
        releaseExpiredLease();

        const envelope = takeNextEnvelope();
        if (envelope) {
          sendJson(response, 200, envelope);
          return;
        }
        if (pendingPoll) {
          sendError(response, 409, "POLL_ALREADY_OPEN", "Only one long poll may be open for the writer.");
          return;
        }

        const timer = setTimeout(() => {
          if (pendingPoll?.response === response) {
            pendingPoll = null;
            response.writeHead(204);
            response.end();
          }
        }, longPollMs);
        pendingPoll = { response, timer, pluginInstanceId };
        response.on("close", () => {
          if (!response.writableEnded && pendingPoll?.response === response) {
            clearTimeout(timer);
            pendingPoll = null;
          }
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/plugin/results") {
        const body = await readJson(request);
        const outcome = acceptResult(body);
        sendJson(response, outcome.replayed ? 200 : 202, outcome);
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/operations") {
        const body = await readJson(request);
        const validationError = validateCommand(body);
        if (validationError) {
          sendError(response, 400, "INVALID_COMMAND", validationError);
          return;
        }

        const fingerprint = commandFingerprint(body);
        const existingId = idempotency.get(body.idempotencyKey);
        if (existingId) {
          const existing = operations.get(existingId);
          if (existing.fingerprint !== fingerprint) {
            sendError(
              response,
              409,
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key is already bound to a different command."
            );
            return;
          }
          sendJson(response, 200, { ...publicOperation(existing), idempotentReplay: true });
          return;
        }
        if (operations.has(body.operationId)) {
          sendError(response, 409, "OPERATION_ID_CONFLICT", "The operationId has already been used.");
          return;
        }

        const operation = {
          request: body,
          operationId: body.operationId,
          idempotencyKey: body.idempotencyKey,
          fingerprint,
          status: "queued",
          attempt: 0,
          createdAt: now(),
          deliveredAt: null,
          completedAt: null,
          result: null,
          error: null
        };
        operations.set(operation.operationId, operation);
        idempotency.set(operation.idempotencyKey, operation.operationId);
        queue.push(operation.operationId);
        sendJson(response, 202, publicOperation(operation));
        dispatch();
        return;
      }

      const operationMatch = url.pathname.match(/^\/v1\/operations\/([^/]+)$/);
      if (request.method === "GET" && operationMatch) {
        releaseExpiredLease();
        dispatch();
        const operation = operations.get(decodeURIComponent(operationMatch[1]));
        if (!operation) {
          sendError(response, 404, "OPERATION_NOT_FOUND", "No operation exists with this operationId.");
          return;
        }
        sendJson(response, 200, publicOperation(operation));
        return;
      }

      sendError(response, 404, "NOT_FOUND", "Unknown bridge endpoint.");
    } catch (error) {
      sendError(response, error.statusCode || 500, error.code || "INTERNAL_ERROR", error.message);
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (request, socket, head) => {
    const base = `http://${request.headers.host || `${host}:${actualPort || requestedPort}`}`;
    const url = new URL(request.url, base);
    if (url.pathname !== "/v1/ws" || url.searchParams.get("token") !== token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const pluginInstanceId = url.searchParams.get("pluginInstanceId");
    const websocketKey = request.headers["sec-websocket-key"];
    if (!pluginInstanceId || !websocketKey) {
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!claimPlugin(pluginInstanceId, "websocket", null, null)) {
      socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash("sha1")
      .update(`${websocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const connection = createWebSocketConnection(socket, {
      onMessage(message) {
        activePlugin.lastSeenAt = now();
        if (message.kind === "hello") {
          const error = validatePluginHello(
            { ...message, pluginInstanceId, transport: "websocket" },
            "websocket"
          );
          if (error) {
            connection.sendJson({ kind: "error", error: { code: "INVALID_PLUGIN_HELLO", message: error } });
            connection.close();
            return;
          }
          activePlugin.context = message.context || null;
          activePlugin.ready = true;
          connection.sendJson({ kind: "connected", ...connectionSnapshot() });
          dispatch();
          return;
        }
        if (message.kind === "result") {
          try {
            connection.sendJson({ kind: "result_ack", ...acceptResult(message.result) });
          } catch (error) {
            connection.sendJson({ kind: "error", error: { code: error.code || "INVALID_RESULT", message: error.message } });
          }
        }
      },
      onClose() {
        if (activePlugin?.websocket === connection) {
          releaseActivePlugin("websocket_closed");
        }
      }
    }, head);

    activePlugin.websocket = connection;
    activePlugin.ready = false;
  });

  const leaseTimer = setInterval(() => {
    releaseExpiredLease();
    dispatch();
  }, Math.max(10, Math.min(leaseMs, 500)));
  leaseTimer.unref();

  function claimPlugin(pluginInstanceId, transport, context, websocket) {
    if (activePlugin && activePlugin.pluginInstanceId !== pluginInstanceId) return false;
    if (activePlugin?.websocket && activePlugin.websocket !== websocket) {
      activePlugin.websocket.close();
    }
    activePlugin = {
      pluginInstanceId,
      transport,
      context,
      websocket,
      ready: transport === "http",
      connectedAt: now(),
      lastSeenAt: now()
    };
    return true;
  }

  function releaseActivePlugin() {
    if (pendingPoll) {
      clearTimeout(pendingPoll.timer);
      pendingPoll.response.writeHead(204);
      pendingPoll.response.end();
      pendingPoll = null;
    }
    activePlugin = null;
    requeueInFlight();
  }

  function requeueInFlight() {
    if (!inFlightId) return;
    const operation = operations.get(inFlightId);
    inFlightId = null;
    if (!operation || TERMINAL_STATUSES.has(operation.status)) return;
    operation.status = "queued";
    operation.deliveredAt = null;
    if (!queue.includes(operation.operationId)) queue.unshift(operation.operationId);
  }

  function releaseExpiredLease() {
    if (!inFlightId) return;
    const operation = operations.get(inFlightId);
    if (!operation || operation.status !== "delivered") {
      inFlightId = null;
      return;
    }
    if (now() - operation.deliveredAt >= leaseMs) requeueInFlight();
  }

  function takeNextEnvelope() {
    if (inFlightId) return null;
    while (queue.length) {
      const operationId = queue.shift();
      const operation = operations.get(operationId);
      if (!operation || TERMINAL_STATUSES.has(operation.status)) continue;
      operation.status = "delivered";
      operation.attempt += 1;
      operation.deliveredAt = now();
      inFlightId = operationId;
      return { ...operation.request, attempt: operation.attempt };
    }
    return null;
  }

  function dispatch() {
    releaseExpiredLease();
    if (!activePlugin?.ready || inFlightId) return;
    if (activePlugin.transport === "http" && !pendingPoll) return;
    if (activePlugin.transport === "websocket" && !activePlugin.websocket) return;
    const envelope = takeNextEnvelope();
    if (!envelope) return;

    if (activePlugin.transport === "websocket" && activePlugin.websocket) {
      activePlugin.websocket.sendJson({ kind: "command", command: envelope });
      return;
    }
    if (activePlugin.transport === "http" && pendingPoll) {
      const { response, timer } = pendingPoll;
      clearTimeout(timer);
      pendingPoll = null;
      sendJson(response, 200, envelope);
      return;
    }

    requeueInFlight();
  }

  function acceptResult(body) {
    const validationError = validateResult(body);
    if (validationError) throw bridgeError(400, "INVALID_RESULT", validationError);
    const operation = operations.get(body.operationId);
    if (!operation) throw bridgeError(404, "OPERATION_NOT_FOUND", "The result references an unknown operation.");
    if (TERMINAL_STATUSES.has(operation.status)) {
      return { ok: true, operationId: operation.operationId, status: operation.status, replayed: true };
    }
    if (inFlightId && inFlightId !== operation.operationId) {
      throw bridgeError(409, "RESULT_OUT_OF_ORDER", "The result does not belong to the active writer command.");
    }

    operation.status = body.ok ? "succeeded" : "failed";
    operation.result = body.ok ? body.result ?? null : null;
    operation.error = body.ok ? null : body.error || { code: "PLUGIN_ERROR", message: "Plugin command failed." };
    operation.completedAt = now();
    queue = queue.filter((operationId) => operationId !== operation.operationId);
    if (inFlightId === operation.operationId) inFlightId = null;
    dispatch();
    return { ok: true, operationId: operation.operationId, status: operation.status, replayed: false };
  }

  function connectionSnapshot() {
    return {
      ok: true,
      schemaVersion: PROTOCOL_VERSION,
      pluginInstanceId: activePlugin.pluginInstanceId,
      transport: activePlugin.transport,
      leaseMs
    };
  }

  return {
    token,
    async start() {
      if (server.listening) return address();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(requestedPort, host, resolve);
      });
      actualPort = server.address().port;
      return address();
    },
    async close() {
      clearInterval(leaseTimer);
      if (pendingPoll) {
        clearTimeout(pendingPoll.timer);
        pendingPoll.response.writeHead(503);
        pendingPoll.response.end();
        pendingPoll = null;
      }
      for (const socket of sockets) socket.destroy();
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
    },
    snapshot() {
      return {
        ...connectionSnapshotSafe(),
        operations: [...operations.values()].map(publicOperation)
      };
    }
  };

  function address() {
    return { host, port: actualPort, url: `http://${host}:${actualPort}` };
  }

  function connectionSnapshotSafe() {
    return {
      pluginConnected: Boolean(activePlugin),
      transport: activePlugin?.transport || null,
      queued: queue.length,
      inFlight: inFlightId
    };
  }
}

function validatePluginHello(body, expectedTransport) {
  if (!body || body.schemaVersion !== PROTOCOL_VERSION) return `schemaVersion must be ${PROTOCOL_VERSION}.`;
  if (!isIdentifier(body.pluginInstanceId)) return "pluginInstanceId must be a non-empty identifier.";
  if (body.transport && body.transport !== expectedTransport) return `transport must be ${expectedTransport}.`;
  return null;
}

function validateCommand(body) {
  if (!body || body.schemaVersion !== PROTOCOL_VERSION) return `schemaVersion must be ${PROTOCOL_VERSION}.`;
  if (!isIdentifier(body.operationId)) return "operationId must be a non-empty identifier.";
  if (!isIdentifier(body.idempotencyKey)) return "idempotencyKey must be a non-empty identifier.";
  if (body.projectId !== "spike-002") return "projectId must be spike-002 in this isolated experiment.";
  if (!body.target || !isIdentifier(body.target.stableId)) return "target.stableId must be provided.";
  if (!body.approval || body.approval.mode !== "technical-spike" || body.approval.reference !== null) {
    return "approval must explicitly declare the isolated technical-spike mode.";
  }
  if (!body.source || !isIdentifier(body.source.client)) return "source.client must be provided.";
  if (!body.command || !["bridge.ping", "bridge.create_marker"].includes(body.command.type)) {
    return "command.type must be bridge.ping or bridge.create_marker.";
  }
  if (body.command.payload !== undefined && !isPlainObject(body.command.payload)) {
    return "command.payload must be an object.";
  }
  return null;
}

function validateResult(body) {
  if (!body || body.schemaVersion !== PROTOCOL_VERSION) return `schemaVersion must be ${PROTOCOL_VERSION}.`;
  if (!isIdentifier(body.operationId)) return "operationId must be a non-empty identifier.";
  if (typeof body.ok !== "boolean") return "ok must be a boolean.";
  if (!body.ok && (!body.error || !isIdentifier(body.error.code) || typeof body.error.message !== "string")) {
    return "A failed result must include error.code and error.message.";
  }
  return null;
}

function commandFingerprint(command) {
  return JSON.stringify({
    schemaVersion: command.schemaVersion,
    projectId: command.projectId,
    target: command.target,
    approval: command.approval,
    command: command.command
  });
}

function publicOperation(operation) {
  return {
    schemaVersion: PROTOCOL_VERSION,
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    status: operation.status,
    attempt: operation.attempt,
    createdAt: operation.createdAt,
    deliveredAt: operation.deliveredAt,
    completedAt: operation.completedAt,
    result: operation.result,
    error: operation.error
  };
}

function isIdentifier(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAuthorized(request, token) {
  return request.headers.authorization === `Bearer ${token}`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw bridgeError(413, "BODY_TOO_LARGE", "Request body exceeds 64 KiB.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw bridgeError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function setCors(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "authorization, content-type");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("cache-control", "no-store");
}

function sendJson(response, status, body) {
  if (response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { ok: false, error: { code, message } });
}

function bridgeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function createWebSocketConnection(socket, handlers, initialData = Buffer.alloc(0)) {
  let buffer = initialData;
  let closed = false;

  function sendFrame(opcode, payload = Buffer.alloc(0)) {
    if (closed || socket.destroyed) return;
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, length]);
    } else if (length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      throw new Error("SPIKE-002 WebSocket frames are limited to 64 KiB.");
    }
    socket.write(Buffer.concat([header, payload]));
  }

  function parse() {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        close(1009);
        return;
      }

      const maskSize = masked ? 4 : 0;
      if (buffer.length < offset + maskSize + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskSize;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      buffer = buffer.subarray(offset + length);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      if (opcode === 0x8) {
        close();
        return;
      }
      if (opcode === 0x9) {
        sendFrame(0x0a, payload);
        continue;
      }
      if (opcode !== 0x1) continue;
      try {
        handlers.onMessage(JSON.parse(payload.toString("utf8")));
      } catch (error) {
        sendJsonMessage({ kind: "error", error: { code: "INVALID_WS_MESSAGE", message: error.message } });
      }
    }
  }

  function sendJsonMessage(value) {
    sendFrame(0x1, Buffer.from(JSON.stringify(value), "utf8"));
  }

  function close(code = 1000) {
    if (closed) return;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    if (!socket.destroyed) {
      sendFrame(0x8, payload);
      socket.end();
    }
    closed = true;
    handlers.onClose();
  }

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    parse();
  });
  socket.on("close", () => {
    if (!closed) {
      closed = true;
      handlers.onClose();
    }
  });
  socket.on("error", () => close(1011));
  if (buffer.length) parse();

  return { sendJson: sendJsonMessage, close };
}

async function runFromCommandLine() {
  const bridge = createBridge({
    port: process.env.ADS_BRIDGE_PORT ? Number(process.env.ADS_BRIDGE_PORT) : 38451,
    token: process.env.ADS_BRIDGE_TOKEN || undefined
  });
  const address = await bridge.start();
  process.stdout.write(
    [
      "SPIKE-002 local bridge is ready.",
      `URL: ${address.url}`,
      `Session token: ${bridge.token}`,
      "Keep this token local and paste it into the Figma development plugin."
    ].join("\n") + "\n"
  );

  const stop = async () => {
    await bridge.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (require.main === module) {
  runFromCommandLine().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  PROTOCOL_VERSION,
  createBridge,
  validateCommand,
  validateResult
};
