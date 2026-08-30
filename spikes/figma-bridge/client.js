#!/usr/bin/env node

const crypto = require("node:crypto");

const baseUrl = process.env.ADS_BRIDGE_URL || "http://127.0.0.1:38451";
const token = process.env.ADS_BRIDGE_TOKEN;
const args = process.argv.slice(2);
const commandName = args[0];

async function main() {
  if (!token) throw new Error("Set ADS_BRIDGE_TOKEN to the session token printed by bridge.js.");
  if (!commandName || !["ping", "marker"].includes(commandName)) {
    throw new Error("Usage: node client.js ping | node client.js marker [label] [idempotency-key]");
  }

  const operationId = `op-${crypto.randomUUID()}`;
  const isMarker = commandName === "marker";
  const label = isMarker ? args[1] || "SPIKE-002 / Local Bridge" : null;
  const idempotencyKey = (isMarker ? args[2] : args[1]) || operationId;
  const envelope = {
    schemaVersion: "0.1",
    operationId,
    idempotencyKey,
    projectId: "spike-002",
    target: {
      stableId: isMarker ? "spike-002/marker/local-bridge" : "spike-002/plugin-session"
    },
    approval: { mode: "technical-spike", reference: null },
    source: { client: "spike-002-cli" },
    command: {
      type: isMarker ? "bridge.create_marker" : "bridge.ping",
      payload: isMarker ? { label } : {}
    }
  };

  const submitted = await request("/v1/operations", {
    method: "POST",
    body: JSON.stringify(envelope)
  });
  const resolvedOperationId = submitted.operationId;
  const deadline = Date.now() + 15_000;
  let operation = submitted;

  while (!new Set(["succeeded", "failed"]).has(operation.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    operation = await request(`/v1/operations/${encodeURIComponent(resolvedOperationId)}`);
  }

  process.stdout.write(`${JSON.stringify(operation, null, 2)}\n`);
  if (operation.status !== "succeeded") process.exitCode = 1;
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body.error || { code: `HTTP_${response.status}`, message: response.statusText };
    throw new Error(`${error.code}: ${error.message}`);
  }
  return body;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
