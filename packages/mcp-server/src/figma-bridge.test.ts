import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WRITER_PROTOCOL_SCHEMA_VERSION,
  createFigmaButtonPlan,
  createFigmaVariablePlan,
  createToolkitError,
} from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };
import validContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };

import { createFigmaBridge, type FigmaBridge } from "./figma-bridge.js";

const SESSION_TOKEN = "fig002-test-session-token-32-chars-minimum";
const PLUGIN_INSTANCE_ID = "c45c06e8-80ae-4478-ad55-9c49c60ecc56";
const OTHER_PLUGIN_INSTANCE_ID = "fc11eead-06a5-4818-abec-2d140a948e94";
const OPERATION_IDS = [
  "2c73620e-29b0-4285-8861-1a65b18f11dc",
  "ae8ee112-0337-4168-93fe-b7b04fa1367e",
  "77f50469-046a-460c-8336-c4dc010e4773",
] as const;
const COMPONENT_DIGEST =
  "sha256:7e6003e59916e0fc445e7ef6d37feb148a3d77908bb7834b3bdb4185530d0e78";
const TOKEN_DIGEST = `sha256:${"a".repeat(64)}`;
const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";

const bridges: FigmaBridge[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function startBridge(
  overrides: Partial<Parameters<typeof createFigmaBridge>[0]> = {},
) {
  const operationDirectory = await mkdtemp(
    join(tmpdir(), "hatchkit-figma-bridge-"),
  );
  temporaryDirectories.push(operationDirectory);
  const bridge = createFigmaBridge({
    leaseMs: 100,
    longPollMs: 20,
    operationDirectory,
    port: 0,
    sessionToken: SESSION_TOKEN,
    ...overrides,
  });
  bridges.push(bridge);
  const address = await bridge.start();
  return { address, bridge, operationDirectory };
}

function command(
  operationId: string,
  idempotencyKey = `key-${operationId}`,
  projectId = "hatch-demo",
) {
  return {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
    command: { payload: {}, type: "writer.ping" },
    idempotencyKey,
    operationId,
    projectId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      kind: "plugin-session",
      stableId: `${projectId}/plugin-session`,
    },
  };
}

function variablesCommand(operationId: string) {
  const planned = createFigmaVariablePlan(
    validTokenSet,
    `sha256:${"a".repeat(64)}`,
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: "approval.tokens.button-foundation.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "token-set" },
    },
    command: { payload: { plan: planned.data }, type: "variables.ensure" },
    idempotencyKey: `variables-${operationId}`,
    operationId,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: "2227db09-eb2f-4dcb-8f6a-386c6271e577",
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function buttonCommand(operationId: string) {
  const planned = createFigmaButtonPlan(
    validContract,
    validTokenSet,
    COMPONENT_DIGEST,
    TOKEN_DIGEST,
  );
  if (!planned.ok) throw new Error(planned.error.message);
  return {
    approval: {
      approvalId: "approval.component.button.1.0.0",
      mode: "approved",
      subject: { ...planned.data.source, type: "component" },
    },
    command: {
      payload: { plan: planned.data },
      type: "components.button.ensure",
    },
    idempotencyKey: `button-${operationId}`,
    operationId,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function styleAuditCommand(operationId: string) {
  return {
    approval: {
      mode: "not_required",
      reason: "read_only_diagnostic",
    },
    command: {
      payload: {
        plan: {
          fileBindingId: FILE_BINDING_ID,
          projectId: "hatch-demo",
          registeredVariables: [
            {
              stableId:
                "hatch-demo/token-set/button-foundation/variables/major-1/variable/semantic/color/action-primary-background",
              tokenPath: "semantic/color/action-primary-background",
            },
          ],
          schemaVersion: "1.0.0",
          scope: "current-page",
        },
      },
      type: "audit.styles.scan",
    },
    idempotencyKey: `audit-${operationId}`,
    operationId,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function componentAuditCommand(operationId: string) {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    command: {
      payload: {
        plan: {
          fileBindingId: FILE_BINDING_ID,
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
          scope: "current-page",
          sources: [
            {
              assetId: "button",
              assetVersion: "1.0.0",
              componentSetNodeId: "100:200",
              componentSetStableId:
                "hatch-demo/component/button/component-set/major-1",
              contentDigest: COMPONENT_DIGEST,
              variants: [
                {
                  figmaName: "Appearance=Primary, State=Default",
                  properties: { Appearance: "Primary", State: "Default" },
                  slotId: "variant/appearance-primary/state-default",
                  stableId:
                    "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
                },
              ],
            },
          ],
        },
      },
      type: "audit.components.scan",
    },
    idempotencyKey: `component-audit-${operationId}`,
    operationId,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function registryDriftAuditCommand(operationId: string) {
  return {
    approval: { mode: "not_required", reason: "read_only_diagnostic" },
    command: {
      payload: {
        plan: {
          componentSets: [
            {
              assetId: "button",
              assetVersion: "1.0.0",
              componentSetKey: "fixture_button_component_set_key_0001",
              contentDigest: COMPONENT_DIGEST,
              nodeId: "100:200",
              stableId: "hatch-demo/component/button/component-set/major-1",
              variantStableIds: [
                "hatch-demo/component/button/component-set/major-1/variant/appearance-primary/state-default",
              ],
            },
          ],
          fileBindingId: FILE_BINDING_ID,
          projectId: "hatch-demo",
          schemaVersion: "1.0.0",
          scope: "entire-file",
          tokenCollections: [
            {
              assetId: "button-foundation",
              assetVersion: "1.0.0",
              contentDigest: TOKEN_DIGEST,
              stableId:
                "hatch-demo/token-set/button-foundation/variables/major-1",
              variableStableIds: [
                "hatch-demo/token-set/button-foundation/variables/major-1/variable/semantic/color/action-primary-background",
              ],
            },
          ],
        },
      },
      type: "audit.registry-drift.scan",
    },
    idempotencyKey: `registry-drift-audit-${operationId}`,
    operationId,
    projectId: "hatch-demo",
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    source: { client: "mcp-server" },
    target: {
      fileBindingId: FILE_BINDING_ID,
      kind: "figma-file",
      stableId: "hatch-demo/figma-file/library",
    },
  };
}

function hello(pluginInstanceId = PLUGIN_INSTANCE_ID) {
  return {
    context: { fileName: "Bridge Contract", pageName: "Page 1" },
    pluginInstanceId,
    schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    transport: "http",
  };
}

async function request(
  url: string,
  path: string,
  body: unknown,
  options: { authorization?: string; contentType?: string } = {},
) {
  const response = await fetch(`${url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: options.authorization ?? `Bearer ${SESSION_TOKEN}`,
      "content-type": options.contentType ?? "application/json",
    },
    method: "POST",
  });
  return {
    body:
      response.status === 204
        ? null
        : (JSON.parse(await response.text()) as unknown),
    response,
  };
}

describe("local Figma Bridge", () => {
  it("exposes a non-sensitive health check and rejects unsafe authentication", async () => {
    const { address } = await startBridge();
    const healthResponse = await fetch(`${address.url}/v1/health`);
    const health = JSON.parse(await healthResponse.text()) as unknown;
    expect(healthResponse.status).toBe(200);
    expect(health).toMatchObject({
      data: {
        inFlight: false,
        pluginConnected: false,
        queued: 0,
        sessionExpired: false,
      },
      ok: true,
      schemaVersion: "1.0.0",
      warnings: [],
    });
    expect(JSON.stringify(health)).not.toContain(SESSION_TOKEN);

    const missing = await fetch(`${address.url}/v1/plugin/connect`, {
      body: JSON.stringify(hello()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(missing.status).toBe(401);
    expect(await missing.text()).toContain("CREDENTIAL_REQUIRED");

    const invalid = await request(address.url, "/v1/plugin/connect", hello(), {
      authorization: "Bearer incorrect-session-token-value",
    });
    expect(invalid.response.status).toBe(401);
    expect(invalid.body).toMatchObject({
      error: { code: "CREDENTIAL_INVALID" },
      ok: false,
    });

    const query = await fetch(
      `${address.url}/v1/plugin/connect?token=${SESSION_TOKEN}`,
      { method: "POST" },
    );
    expect(query.status).toBe(400);
    expect(await query.text()).toContain("UNSAFE_CREDENTIAL_SOURCE");
  });

  it("allows exactly one Plugin owner and binds results to that instance", async () => {
    const { address } = await startBridge();
    const connected = await request(address.url, "/v1/plugin/connect", hello());
    expect(connected.response.status).toBe(200);
    expect(connected.body).toMatchObject({
      data: { pluginInstanceId: PLUGIN_INSTANCE_ID, transport: "http" },
      ok: true,
    });

    const conflict = await request(
      address.url,
      "/v1/plugin/connect",
      hello(OTHER_PLUGIN_INSTANCE_ID),
    );
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "IDENTITY_CONFLICT" },
      ok: false,
    });

    await request(address.url, "/v1/operations", command(OPERATION_IDS[0]));
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const foreignResult = await request(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: OTHER_PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(foreignResult.response.status).toBe(409);
    expect(foreignResult.body).toMatchObject({
      error: { code: "IDENTITY_CONFLICT" },
      ok: false,
    });
  });

  it("dispatches FIFO with one in-flight command and accepts an idempotent result replay", async () => {
    const { address } = await startBridge();
    await request(address.url, "/v1/plugin/connect", hello());
    await request(address.url, "/v1/operations", command(OPERATION_IDS[0]));
    await request(address.url, "/v1/operations", command(OPERATION_IDS[1]));

    const first = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(first.body).toMatchObject({
      data: {
        command: { attempt: 1, operationId: OPERATION_IDS[0] },
      },
      ok: true,
    });

    const blocked = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(blocked.response.status).toBe(204);

    const result = {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: { pong: true },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    const accepted = await request(address.url, "/v1/plugin/results", result);
    expect(accepted.response.status).toBe(202);
    expect(accepted.body).toMatchObject({
      data: { operation: { status: "succeeded" }, replayed: false },
      ok: true,
    });
    const replay = await request(address.url, "/v1/plugin/results", result);
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({ data: { replayed: true }, ok: true });

    const second = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(second.body).toMatchObject({
      data: { command: { operationId: OPERATION_IDS[1] } },
      ok: true,
    });
  });

  it("carries an approved Variable plan through the authenticated queue", async () => {
    const { address } = await startBridge({ authorizeWrite: () => null });
    await request(address.url, "/v1/plugin/connect", hello());
    const submitted = await request(
      address.url,
      "/v1/operations",
      variablesCommand(OPERATION_IDS[0]),
    );
    expect(submitted.response.status).toBe(202);

    const delivery = await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(delivery.body).toMatchObject({
      data: {
        command: {
          approval: { mode: "approved" },
          command: {
            type: "variables.ensure",
          },
        },
      },
      ok: true,
    });

    const pluginResult = {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        collection: {
          action: "created",
          stableId: "hatch-demo/token-set/button-foundation/variables/major-1",
        },
        deferredTypographyCount: 1,
        type: "variables.ensure",
        variables: { created: 30, unchanged: 0, updated: 0 },
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    const reported = await request(
      address.url,
      "/v1/plugin/results",
      pluginResult,
    );
    expect(reported.response.status).toBe(202);

    const operation = await request(address.url, "/v1/operations/get", {
      operationId: OPERATION_IDS[0],
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(operation.body).toMatchObject({
      data: {
        result: {
          type: "variables.ensure",
          variables: { created: 30 },
        },
        status: "succeeded",
      },
      ok: true,
    });
  });

  it("carries read-only audits without invoking write authorization", async () => {
    const authorizeWrite = vi.fn(() =>
      createToolkitError({
        code: "APPROVAL_REQUIRED",
        message: "Writes are blocked.",
        recoveryInstruction: "Obtain approval before writing.",
      }),
    );
    const { address } = await startBridge({ authorizeWrite });
    await request(address.url, "/v1/plugin/connect", hello());
    const submitted = await request(
      address.url,
      "/v1/operations",
      styleAuditCommand(OPERATION_IDS[0]),
    );
    expect(submitted.response.status).toBe(202);
    expect(authorizeWrite).not.toHaveBeenCalled();

    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const reported = await request(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        findings: [],
        page: { id: "1:2", name: "Page 1" },
        passed: true,
        schemaVersion: "1.0.0",
        scope: "current-page",
        summary: {
          auditedStyles: 5,
          hardCodedStyles: 0,
          nodesWithFindings: 0,
          registeredBindings: 5,
          unregisteredVariables: 0,
        },
        type: "audit.styles.scan",
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(reported.response.status).toBe(202);
    expect(reported.body).toMatchObject({
      data: { operation: { status: "succeeded" } },
      ok: true,
    });

    const componentSubmitted = await request(
      address.url,
      "/v1/operations",
      componentAuditCommand(OPERATION_IDS[1]),
    );
    expect(componentSubmitted.response.status).toBe(202);
    expect(authorizeWrite).not.toHaveBeenCalled();
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const componentReported = await request(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: OPERATION_IDS[1],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        findings: [],
        page: { id: "1:2", name: "Page 1" },
        passed: true,
        schemaVersion: "1.0.0",
        scope: "current-page",
        summary: {
          auditedNodes: 5,
          compliantInstances: 5,
          detachedOrApproximate: 0,
          provenanceMismatches: 0,
          unregisteredSources: 0,
          unregisteredVariants: 0,
          variantPropertyMismatches: 0,
        },
        type: "audit.components.scan",
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(componentReported.response.status).toBe(202);
    expect(componentReported.body).toMatchObject({
      data: { operation: { status: "succeeded" } },
      ok: true,
    });

    const driftSubmitted = await request(
      address.url,
      "/v1/operations",
      registryDriftAuditCommand(OPERATION_IDS[2]),
    );
    expect(driftSubmitted.response.status).toBe(202);
    expect(authorizeWrite).not.toHaveBeenCalled();
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    const driftReported = await request(address.url, "/v1/plugin/results", {
      ok: true,
      operationId: OPERATION_IDS[2],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        findings: [],
        passed: true,
        schemaVersion: "1.0.0",
        scope: "entire-file",
        summary: {
          auditedFigmaAssets: 2,
          duplicateAssets: 0,
          invalidMarkers: 0,
          locatorMismatches: 0,
          mismatchedChildren: 0,
          mismatchedDigests: 0,
          mismatchedVersions: 0,
          missingInFigma: 0,
          missingInRegistry: 0,
        },
        type: "audit.registry-drift.scan",
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(driftReported.response.status).toBe(202);
    expect(driftReported.body).toMatchObject({
      data: { operation: { status: "succeeded" } },
      ok: true,
    });
  });

  it("records PARTIAL_WRITE when Registry finalization fails after Figma success", async () => {
    const finalizeWrite = vi.fn(() =>
      Promise.resolve(
        createToolkitError({
          code: "PARTIAL_WRITE",
          message: "The Figma asset exists, but Registry commit failed.",
          recoveryInstruction:
            "Resolve the Registry conflict and retry the same command.",
        }),
      ),
    );
    const { address } = await startBridge({
      authorizeWrite: () => null,
      finalizeWrite,
    });
    await request(address.url, "/v1/plugin/connect", hello());
    await request(
      address.url,
      "/v1/operations",
      buttonCommand(OPERATION_IDS[0]),
    );
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });

    const buttonResult = {
      ok: true,
      operationId: OPERATION_IDS[0],
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      result: {
        componentSet: {
          action: "created",
          nodeId: "300:400",
          stableId: "hatch-demo/component/button/component-set/major-1",
        },
        labelPropertyName: "Label#300:401",
        type: "components.button.ensure",
        typography: {
          lineHeightStrategy: "resolved-percent",
          variableBindings: 4,
        },
        variants: { created: 4, unchanged: 0, updated: 0 },
      },
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    };
    const reported = await request(
      address.url,
      "/v1/plugin/results",
      buttonResult,
    );

    expect(finalizeWrite).toHaveBeenCalledOnce();
    expect(reported.response.status).toBe(202);
    expect(reported.body).toMatchObject({
      data: {
        operation: {
          error: { code: "PARTIAL_WRITE" },
          status: "partial",
        },
        replayed: false,
      },
      ok: true,
    });
    const operation = await request(address.url, "/v1/operations/get", {
      operationId: OPERATION_IDS[0],
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(operation.body).toMatchObject({
      data: { error: { code: "PARTIAL_WRITE" }, status: "partial" },
      ok: true,
    });
    const replay = await request(
      address.url,
      "/v1/plugin/results",
      buttonResult,
    );
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({
      data: { operation: { status: "partial" }, replayed: true },
      ok: true,
    });
    expect(finalizeWrite).toHaveBeenCalledOnce();
  });

  it("blocks write commands when no Git approval verifier is configured", async () => {
    const { address, bridge } = await startBridge();
    const blocked = await request(
      address.url,
      "/v1/operations",
      variablesCommand(OPERATION_IDS[0]),
    );
    expect(blocked.response.status).toBe(403);
    expect(blocked.body).toMatchObject({
      error: { code: "APPROVAL_REQUIRED" },
      ok: false,
    });
    expect(bridge.snapshot().queue.queuedOperationIds).toEqual([]);
  });

  it("replays matching idempotency and rejects conflicting command reuse", async () => {
    const { address } = await startBridge();
    const first = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[0], "same-key"),
    );
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({
      data: { idempotentReplay: false },
      ok: true,
    });

    const replay = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[1], "same-key"),
    );
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({
      data: {
        idempotentReplay: true,
        operation: { operationId: OPERATION_IDS[0] },
      },
      ok: true,
    });

    const conflict = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[2], "same-key", "another-project"),
    );
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      ok: false,
    });
  });

  it("releases the Writer on expiry and invalidates an explicit disconnect", async () => {
    let monotonic = 0;
    const { address, bridge } = await startBridge({
      nowMonotonicMs: () => monotonic,
      sessionTtlMs: 100,
    });
    await request(address.url, "/v1/plugin/connect", hello());
    await request(address.url, "/v1/operations", command(OPERATION_IDS[0]));
    await request(address.url, "/v1/plugin/next", {
      pluginInstanceId: PLUGIN_INSTANCE_ID,
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    monotonic = 101;

    const expired = await request(address.url, "/v1/operations/get", {
      operationId: OPERATION_IDS[0],
      schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
    });
    expect(expired.response.status).toBe(401);
    expect(expired.body).toMatchObject({
      error: { code: "CREDENTIAL_EXPIRED" },
      ok: false,
    });
    expect(bridge.snapshot()).toMatchObject({
      pluginConnected: false,
      queue: {
        inFlightOperationId: null,
        queuedOperationIds: [OPERATION_IDS[0]],
      },
      sessionExpired: true,
    });

    const fresh = await startBridge();
    await request(fresh.address.url, "/v1/plugin/connect", hello());
    const disconnected = await request(
      fresh.address.url,
      "/v1/plugin/disconnect",
      {
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        schemaVersion: WRITER_PROTOCOL_SCHEMA_VERSION,
      },
    );
    expect(disconnected.response.status).toBe(200);
    const afterDisconnect = await request(
      fresh.address.url,
      "/v1/plugin/connect",
      hello(),
    );
    expect(afterDisconnect.response.status).toBe(401);
    expect(afterDisconnect.body).toMatchObject({
      error: { code: "CREDENTIAL_EXPIRED" },
      ok: false,
    });
  });

  it("enforces request limits and never persists raw credentials or idempotency keys", async () => {
    const { address, operationDirectory } = await startBridge();
    const wrongContentType = await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[0]),
      { contentType: "text/plain" },
    );
    expect(wrongContentType.response.status).toBe(400);
    expect(wrongContentType.body).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });

    const oversized = await request(address.url, "/v1/operations", {
      padding: "x".repeat(65 * 1024),
    });
    expect(oversized.response.status).toBe(400);
    expect(oversized.body).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });

    await request(
      address.url,
      "/v1/operations",
      command(OPERATION_IDS[0], "never-persist-this-key"),
    );
    const files = await readdir(operationDirectory);
    const content = await readFile(
      join(operationDirectory, files[0] ?? "missing"),
      "utf8",
    );
    expect(content).not.toContain(SESSION_TOKEN);
    expect(content).not.toContain("never-persist-this-key");
    expect(content).toContain("sha256:");
  });
});
