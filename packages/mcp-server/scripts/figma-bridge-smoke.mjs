import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { createFigmaBridge } from "../dist/index.js";

const sessionToken = "fig002-smoke-session-token-32-chars-minimum";
const pluginInstanceId = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";
const operationId = "2c73620e-29b0-4285-8861-1a65b18f11dc";
const operationDirectory = await mkdtemp(
  join(tmpdir(), "hatchkit-figma-bridge-smoke-"),
);
const bridge = createFigmaBridge({
  longPollMs: 50,
  operationDirectory,
  port: 0,
  sessionToken,
});

async function post(url, path, body) {
  const response = await globalThis.fetch(`${url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const parsed = response.status === 204 ? null : await response.json();
  if (!response.ok || parsed?.ok === false) {
    throw new Error(`Bridge smoke request failed at ${path}.`);
  }
  return parsed?.data ?? null;
}

try {
  const address = await bridge.start();
  await post(address.url, "/v1/plugin/connect", {
    context: { fileName: "Smoke", pageName: "Page 1" },
    pluginInstanceId,
    schemaVersion: "1.0.0",
    transport: "http",
  });
  await post(address.url, "/v1/operations", {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey: "fig002-smoke-ping",
    operationId,
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
    source: { client: "bridge-smoke" },
    target: {
      kind: "plugin-session",
      stableId: "hatch-demo/plugin-session",
    },
  });
  const delivery = await post(address.url, "/v1/plugin/next", {
    pluginInstanceId,
    schemaVersion: "1.0.0",
  });
  if (
    delivery?.command?.operationId !== operationId ||
    delivery.command.command?.type !== "writer.ping"
  ) {
    throw new Error("Bridge smoke received the wrong Writer Command.");
  }
  await post(address.url, "/v1/plugin/results", {
    ok: true,
    operationId,
    pluginInstanceId,
    result: { pong: true },
    schemaVersion: "1.0.0",
  });
  const operation = await post(address.url, "/v1/operations/get", {
    operationId,
    schemaVersion: "1.0.0",
  });
  if (operation?.status !== "succeeded") {
    throw new Error("Bridge smoke operation did not succeed.");
  }
  process.stdout.write(
    "Hatchkit Figma Bridge smoke passed (authenticated ping, FIFO result, operation lookup).\n",
  );
} finally {
  await bridge.close();
  await rm(operationDirectory, { force: true, recursive: true });
}
