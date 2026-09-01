import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createToolkitError,
  type ErrorCode,
  type ToolkitError,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGitApprovalVerifier } from "./approval-verifier.js";
import { createFigmaBridge, type FigmaBridge } from "./figma-bridge.js";
import { createLocalWriterClient } from "./local-writer-client.js";
import { createHatchkitMcpServer } from "./server.js";
import { HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME } from "./write-tools.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const DESIGN_SYSTEM_ROOT = resolve(WORKSPACE_ROOT, "design-system/hatch-demo");
const SESSION_TOKEN = "loop003-test-session-token-32-characters";
const REQUEST_ID = "2c73620e-29b0-4285-8861-1a65b18f11dc";
const bridges: FigmaBridge[] = [];
const clients: Client[] = [];
const servers: ReturnType<typeof createHatchkitMcpServer>[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function startLoop(
  authorizeWrite: (
    command: WriterCommandEnvelope,
  ) => Promise<ToolkitError | null> | ToolkitError | null,
) {
  const operationDirectory = await mkdtemp(join(tmpdir(), "loop003-bridge-"));
  temporaryDirectories.push(operationDirectory);
  const bridge = createFigmaBridge({
    authorizeWrite,
    operationDirectory,
    port: 0,
    sessionToken: SESSION_TOKEN,
  });
  bridges.push(bridge);
  const address = await bridge.start();
  const server = createHatchkitMcpServer({
    designSystemRoot: DESIGN_SYSTEM_ROOT,
    expectedProjectId: "hatch-demo",
    writer: createLocalWriterClient({
      pollIntervalMs: 5,
      sessionToken: SESSION_TOKEN,
      url: address.url,
    }),
  });
  const client = new Client({ name: "loop003-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  servers.push(server);
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { bridge, client };
}

async function insert(client: Client) {
  return client.callTool({
    arguments: {
      assetId: "button",
      instanceId: "settings/save-button",
      label: "Save changes",
      requestId: REQUEST_ID,
      variantSelections: { appearance: "primary", state: "default" },
      waitTimeoutMs: 1_000,
      x: 320,
      y: 240,
    },
    name: HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
  });
}

function approvalError(code: ErrorCode): ToolkitError {
  return createToolkitError({
    code,
    message: `The approval gate stopped the operation with ${code}.`,
    recoveryInstruction:
      "Resolve the exact approval state in Git before retrying the same request.",
    target: {
      logicalId: "approval.component.button.1.0.0",
      type: "approval",
    },
  });
}

function expectRejectedWithoutQueue(
  result: Awaited<ReturnType<typeof insert>>,
  bridge: FigmaBridge,
  code: ErrorCode,
): void {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
  expect(JSON.stringify(result)).toContain(code);
  expect(bridge.snapshot()).toMatchObject({
    pluginConnected: false,
    queue: {
      inFlightOperationId: null,
      operations: [],
      queuedOperationIds: [],
    },
  });
}

describe("Agent Loop approval boundary", () => {
  it("uses the real Git verifier and blocks the public demo's missing Approval", async () => {
    const verify = createGitApprovalVerifier({
      designSystemRoot: DESIGN_SYSTEM_ROOT,
      expectedProjectId: "hatch-demo",
    });
    const { bridge, client } = await startLoop(verify);

    expectRejectedWithoutQueue(
      await insert(client),
      bridge,
      "APPROVAL_REQUIRED",
    );
  });

  it.each([
    "APPROVAL_IN_REVIEW",
    "APPROVAL_CHANGES_REQUESTED",
    "APPROVAL_INCOMPLETE",
    "APPROVAL_REJECTED",
    "APPROVAL_STALE",
    "APPROVAL_SUPERSEDED",
    "APPROVAL_REVOKED",
  ] as const)("propagates %s without dispatching to Figma", async (code) => {
    const authorizeWrite = vi.fn<
      (command: WriterCommandEnvelope) => ToolkitError
    >(() => approvalError(code));
    const { bridge, client } = await startLoop(authorizeWrite);

    expectRejectedWithoutQueue(await insert(client), bridge, code);
    expect(authorizeWrite).toHaveBeenCalledOnce();
    expect(authorizeWrite.mock.calls[0]?.[0]).toMatchObject({
      approval: {
        approvalId: "approval.component.button.1.0.0",
        mode: "approved",
      },
      command: { type: "instances.button.insert" },
      operationId: REQUEST_ID,
    });
  });
});
