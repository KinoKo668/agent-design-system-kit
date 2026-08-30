const assert = require("node:assert/strict");
const test = require("node:test");

const { createBridge } = require("../bridge.js");

async function withBridge(options, run) {
  const bridge = createBridge({
    token: "test-token",
    longPollMs: 40,
    leaseMs: 80,
    ...options
  });
  const address = await bridge.start();
  try {
    await run({ bridge, baseUrl: address.url, token: bridge.token });
  } finally {
    await bridge.close();
  }
}

function auth(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    connection: "close"
  };
}

async function connectHttp(baseUrl, token, pluginInstanceId = "plugin-http") {
  const response = await fetch(`${baseUrl}/v1/plugin/connect`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      schemaVersion: "0.1",
      pluginInstanceId,
      transport: "http",
      context: { fileName: "Bridge Test", pageName: "Page 1" }
    })
  });
  assert.equal(response.status, 200);
}

function command(operationId, idempotencyKey = operationId, type = "bridge.ping", payload = {}) {
  return {
    schemaVersion: "0.1",
    operationId,
    idempotencyKey,
    projectId: "spike-002",
    target: {
      stableId: type === "bridge.create_marker"
        ? "spike-002/marker/local-bridge"
        : "spike-002/plugin-session"
    },
    approval: { mode: "technical-spike", reference: null },
    source: { client: "node-test" },
    command: { type, payload }
  };
}

async function submit(baseUrl, token, body) {
  return fetch(`${baseUrl}/v1/operations`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(body)
  });
}

async function nextCommand(baseUrl, token, pluginInstanceId = "plugin-http") {
  return fetch(
    `${baseUrl}/v1/plugin/next?pluginInstanceId=${encodeURIComponent(pluginInstanceId)}`,
    { headers: auth(token) }
  );
}

async function reportResult(baseUrl, token, operationId, result = { pong: true }) {
  return fetch(`${baseUrl}/v1/plugin/results`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      schemaVersion: "0.1",
      operationId,
      ok: true,
      result
    })
  });
}

test("rejects unauthenticated local requests", async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/operations`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify(command("op-unauthorized"))
    });
    assert.equal(response.status, 401);
  });
});

test("confines the approval bypass to the SPIKE-002 project and requires a target", async () => {
  await withBridge({}, async ({ baseUrl, token }) => {
    const wrongProject = command("op-wrong-project");
    wrongProject.projectId = "production-project";
    const projectResponse = await submit(baseUrl, token, wrongProject);
    assert.equal(projectResponse.status, 400);

    const missingTarget = command("op-missing-target");
    delete missingTarget.target;
    const targetResponse = await submit(baseUrl, token, missingTarget);
    assert.equal(targetResponse.status, 400);
  });
});

test("delivers an HTTP command and records the plugin result", async () => {
  await withBridge({}, async ({ baseUrl, token }) => {
    await connectHttp(baseUrl, token);

    const submitted = await submit(baseUrl, token, command("op-http"));
    assert.equal(submitted.status, 202);

    const delivered = await nextCommand(baseUrl, token);
    assert.equal(delivered.status, 200);
    assert.equal((await delivered.json()).operationId, "op-http");

    const reported = await reportResult(baseUrl, token, "op-http");
    assert.equal(reported.status, 202);

    const operation = await fetch(`${baseUrl}/v1/operations/op-http`, {
      headers: auth(token)
    });
    const body = await operation.json();
    assert.equal(body.status, "succeeded");
    assert.deepEqual(body.result, { pong: true });
  });
});

test("deduplicates the same idempotency key and rejects conflicting reuse", async () => {
  await withBridge({}, async ({ baseUrl, token }) => {
    const first = await submit(baseUrl, token, command("op-first", "same-key"));
    assert.equal(first.status, 202);

    const duplicate = await submit(baseUrl, token, command("op-second", "same-key"));
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.operationId, "op-first");
    assert.equal(duplicateBody.idempotentReplay, true);

    const conflict = await submit(
      baseUrl,
      token,
      command("op-third", "same-key", "bridge.create_marker", { label: "Different" })
    );
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "IDEMPOTENCY_CONFLICT");
  });
});

test("keeps one command in flight and preserves FIFO order", async () => {
  await withBridge({}, async ({ baseUrl, token }) => {
    await connectHttp(baseUrl, token);
    await submit(baseUrl, token, command("op-fifo-1"));
    await submit(baseUrl, token, command("op-fifo-2"));

    const first = await nextCommand(baseUrl, token);
    assert.equal((await first.json()).operationId, "op-fifo-1");

    const blocked = await nextCommand(baseUrl, token);
    assert.equal(blocked.status, 204);

    await reportResult(baseUrl, token, "op-fifo-1");
    const second = await nextCommand(baseUrl, token);
    assert.equal((await second.json()).operationId, "op-fifo-2");
  });
});

test("redelivers an unacknowledged command after its lease expires", async () => {
  await withBridge({ leaseMs: 30, longPollMs: 10 }, async ({ baseUrl, token }) => {
    await connectHttp(baseUrl, token);
    await submit(baseUrl, token, command("op-redelivery"));

    const first = await nextCommand(baseUrl, token);
    assert.equal((await first.json()).attempt, 1);

    await new Promise((resolve) => setTimeout(resolve, 45));
    const second = await nextCommand(baseUrl, token);
    const body = await second.json();
    assert.equal(body.operationId, "op-redelivery");
    assert.equal(body.attempt, 2);
  });
});

test("delivers and completes the same envelope over WebSocket", async () => {
  await withBridge({}, async ({ baseUrl, token }) => {
    const wsUrl = baseUrl.replace("http://", "ws://");
    const socket = new WebSocket(
      `${wsUrl}/v1/ws?token=${encodeURIComponent(token)}&pluginInstanceId=plugin-ws`
    );

    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    socket.send(JSON.stringify({
      kind: "hello",
      schemaVersion: "0.1",
      context: { fileName: "Bridge Test", pageName: "Page 1" }
    }));

    const commandPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket command timed out")), 500);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.kind === "command") {
          clearTimeout(timer);
          resolve(message.command);
        }
      });
    });

    await submit(baseUrl, token, command("op-ws"));
    const delivered = await commandPromise;
    assert.equal(delivered.operationId, "op-ws");

    socket.send(JSON.stringify({
      kind: "result",
      result: {
        schemaVersion: "0.1",
        operationId: "op-ws",
        ok: true,
        result: { pong: true }
      }
    }));

    await new Promise((resolve) => setTimeout(resolve, 15));
    const operation = await fetch(`${baseUrl}/v1/operations/op-ws`, {
      headers: auth(token)
    });
    assert.equal((await operation.json()).status, "succeeded");
    socket.close();
  });
});
