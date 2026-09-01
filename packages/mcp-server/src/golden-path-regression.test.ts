import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  canonicalizeJson,
  createSuccessResult,
  toWriterCommandFingerprintSubject,
  writerCommandEnvelopeSchema,
  type JsonObject,
  type WriterCommandEnvelope,
} from "@agent-design-system-kit/core";
import { afterEach, describe, expect, it } from "vitest";

import { HATCHKIT_COMPONENT_SEARCH_TOOL_NAME } from "./query-tools.js";
import { HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME } from "./resolution-tools.js";
import {
  HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
  HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
  HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
  HATCHKIT_STYLE_AUDIT_TOOL_NAME,
} from "./write-tools.js";
import {
  HATCHKIT_STATUS_TOOL_NAME,
  createHatchkitMcpServer,
} from "./server.js";
import {
  WRITER_OPERATION_SCHEMA_VERSION,
  type WriterOperation,
} from "./writer-queue.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const INSERT_REQUEST_ID = "80000000-0000-4000-8000-000000000001";
const STYLE_REQUEST_ID = "80000000-0000-4000-8000-000000000002";
const COMPONENT_REQUEST_ID = "80000000-0000-4000-8000-000000000003";
const DRIFT_REQUEST_ID = "80000000-0000-4000-8000-000000000004";

function operation(
  command: WriterCommandEnvelope,
  result: JsonObject,
): WriterOperation {
  return {
    attempt: 1,
    commandFingerprint: `sha256:${"a".repeat(64)}`,
    commandType: command.command.type,
    completedAt: "2026-09-01T23:00:01.000Z",
    dispatchedAt: "2026-09-01T23:00:00.500Z",
    idempotencyKeyHash: `sha256:${"b".repeat(64)}`,
    operationId: command.operationId,
    projectId: command.projectId,
    queuedAt: "2026-09-01T23:00:00.000Z",
    result,
    schemaVersion: WRITER_OPERATION_SCHEMA_VERSION,
    status: "succeeded",
    targetStableId: command.target.stableId,
  };
}

class GoldenPathWriter {
  readonly commands: WriterCommandEnvelope[] = [];
  readonly completed = new Map<
    string,
    { readonly fingerprint: string; readonly operation: WriterOperation }
  >();

  execute(commandInput: WriterCommandEnvelope) {
    const command = writerCommandEnvelopeSchema.parse(commandInput);
    const fingerprint = canonicalizeJson(
      toWriterCommandFingerprintSubject(command),
    );
    const replay = this.completed.get(command.operationId);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) {
        throw new Error(
          "Golden path reused an operation ID for another intent.",
        );
      }
      this.commands.push(command);
      return Promise.resolve(createSuccessResult(replay.operation));
    }
    let result: JsonObject;
    switch (command.command.type) {
      case "instances.button.insert": {
        const plan = command.command.payload.plan;
        result = {
          componentSet: {
            nodeId: plan.componentSet.nodeId,
            stableId: plan.componentSet.stableId,
          },
          instance: {
            action: "created",
            nodeId: "300:400",
            stableId: plan.instance.stableId,
          },
          type: "instances.button.insert",
          variant: { stableId: plan.selectedVariant.stableId },
        };
        break;
      }
      case "audit.styles.scan": {
        const count = command.command.payload.plan.registeredVariables.length;
        result = {
          findings: [],
          page: { id: "200:1", name: "Golden Path" },
          passed: true,
          schemaVersion: "1.0.0",
          scope: "current-page",
          summary: {
            auditedStyles: count,
            hardCodedStyles: 0,
            nodesWithFindings: 0,
            registeredBindings: count,
            unregisteredVariables: 0,
          },
          type: "audit.styles.scan",
        };
        break;
      }
      case "audit.components.scan":
        result = {
          findings: [],
          page: { id: "200:1", name: "Golden Path" },
          passed: true,
          schemaVersion: "1.0.0",
          scope: "current-page",
          summary: {
            auditedNodes: 1,
            compliantInstances: 1,
            detachedOrApproximate: 0,
            provenanceMismatches: 0,
            unregisteredSources: 0,
            unregisteredVariants: 0,
            variantPropertyMismatches: 0,
          },
          type: "audit.components.scan",
        };
        break;
      case "audit.registry-drift.scan":
        result = {
          findings: [],
          passed: true,
          schemaVersion: "1.0.0",
          scope: "entire-file",
          summary: {
            auditedFigmaAssets:
              command.command.payload.plan.tokenCollections.length +
              command.command.payload.plan.componentSets.length,
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
        };
        break;
      default:
        throw new Error(
          `Unexpected golden-path command: ${command.command.type}`,
        );
    }
    const completed = operation(command, result);
    this.completed.set(command.operationId, {
      fingerprint,
      operation: completed,
    });
    this.commands.push(command);
    return Promise.resolve(createSuccessResult(completed));
  }
}

const clients: Client[] = [];
const servers: ReturnType<typeof createHatchkitMcpServer>[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
});

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool({ arguments: args, name });
  expect(result.isError).not.toBe(true);
  return result;
}

describe("QA-001 Agent-facing golden path", () => {
  it("resolves, inserts idempotently, and passes all three audit gates", async () => {
    const writer = new GoldenPathWriter();
    const server = createHatchkitMcpServer({
      designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
      expectedProjectId: "hatch-demo",
      writer,
    });
    const client = new Client({
      name: "hatchkit-golden-path",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const status = await call(client, HATCHKIT_STATUS_TOOL_NAME, {});
    expect(status.structuredContent).toMatchObject({
      data: { server: { access: "writer-enabled" }, status: "ready" },
      ok: true,
    });
    const search = await call(client, HATCHKIT_COMPONENT_SEARCH_TOOL_NAME, {
      term: "Button",
    });
    expect(search.structuredContent).toMatchObject({
      data: {
        items: [{ asset: { id: "button" }, availability: "figma-ready" }],
      },
      ok: true,
    });
    const resolved = await call(client, HATCHKIT_COMPONENT_RESOLVE_TOOL_NAME, {
      assetId: "button",
      variantSelections: { appearance: "primary", state: "default" },
    });
    expect(resolved.structuredContent).toMatchObject({
      data: {
        selectedVariant: { id: "appearance-primary/state-default" },
        status: "figma-ready",
      },
      ok: true,
    });

    const insertArguments = {
      assetId: "button",
      instanceId: "golden-path/submit",
      label: "Continue",
      requestId: INSERT_REQUEST_ID,
      variantSelections: { appearance: "primary", state: "default" },
      waitTimeoutMs: 5_000,
      x: 120,
      y: 240,
    };
    const firstInsert = await call(
      client,
      HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
      insertArguments,
    );
    const exactReplay = await call(
      client,
      HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
      insertArguments,
    );
    expect(exactReplay.structuredContent).toEqual(
      firstInsert.structuredContent,
    );
    expect(firstInsert.structuredContent).toMatchObject({
      data: {
        audit: {
          approval: "verified-by-bridge",
          component: "audited-by-plugin",
          registry: "ready",
        },
        operation: { action: "created", instanceNodeId: "300:400" },
        status: "inserted",
      },
      ok: true,
    });

    const styleAudit = await call(client, HATCHKIT_STYLE_AUDIT_TOOL_NAME, {
      requestId: STYLE_REQUEST_ID,
      waitTimeoutMs: 5_000,
    });
    const componentAudit = await call(
      client,
      HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
      { requestId: COMPONENT_REQUEST_ID, waitTimeoutMs: 5_000 },
    );
    const driftAudit = await call(
      client,
      HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
      { requestId: DRIFT_REQUEST_ID, waitTimeoutMs: 5_000 },
    );
    for (const audit of [styleAudit, componentAudit, driftAudit]) {
      expect(audit.structuredContent).toMatchObject({
        data: { audit: { findings: [], passed: true }, status: "passed" },
        ok: true,
      });
    }

    expect(writer.commands.map(({ command }) => command.type)).toEqual([
      "instances.button.insert",
      "instances.button.insert",
      "audit.styles.scan",
      "audit.components.scan",
      "audit.registry-drift.scan",
    ]);
    const [
      firstCommand,
      replayCommand,
      styleCommand,
      componentCommand,
      driftCommand,
    ] = writer.commands;
    expect(
      canonicalizeJson(toWriterCommandFingerprintSubject(firstCommand!)),
    ).toBe(canonicalizeJson(toWriterCommandFingerprintSubject(replayCommand!)));
    if (styleCommand?.command.type !== "audit.styles.scan") {
      throw new Error("Expected the style audit command.");
    }
    if (componentCommand?.command.type !== "audit.components.scan") {
      throw new Error("Expected the component audit command.");
    }
    if (driftCommand?.command.type !== "audit.registry-drift.scan") {
      throw new Error("Expected the Registry drift audit command.");
    }
    expect(styleCommand.command.payload.plan.registeredVariables).toHaveLength(
      30,
    );
    expect(
      componentCommand.command.payload.plan.sources[0]?.variants,
    ).toHaveLength(4);
    expect(driftCommand.command.payload.plan).toMatchObject({
      componentSets: [{ nodeId: "100:200" }],
      scope: "entire-file",
      tokenCollections: [{ assetId: "button-foundation" }],
    });
  });
});
