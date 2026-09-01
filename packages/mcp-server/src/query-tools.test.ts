import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HATCHKIT_BRIEF_QUERY_TOOL_NAME,
  HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
  HATCHKIT_TOKEN_QUERY_TOOL_NAME,
} from "./query-tools.js";
import { createHatchkitMcpServer } from "./server.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
let client: Client;
let server: ReturnType<typeof createHatchkitMcpServer>;

beforeEach(async () => {
  server = createHatchkitMcpServer({
    designSystemRoot: resolve(WORKSPACE_ROOT, "design-system/hatch-demo"),
    expectedProjectId: "hatch-demo",
  });
  client = new Client({ name: "hatchkit-query-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await Promise.allSettled([client.close(), server.close()]);
});

describe("Hatchkit MCP query tools", () => {
  it("lists Brief summaries before returning one exact full Brief", async () => {
    const summary = await client.callTool({
      arguments: {},
      name: HATCHKIT_BRIEF_QUERY_TOOL_NAME,
    });
    const full = await client.callTool({
      arguments: {
        assetId: "product-foundation",
        assetVersion: "1.0.0",
        detail: "full",
      },
      name: HATCHKIT_BRIEF_QUERY_TOOL_NAME,
    });

    expect(summary.isError).not.toBe(true);
    expect(summary.structuredContent).toMatchObject({
      data: {
        items: [
          {
            asset: { id: "product-foundation", version: "1.0.0" },
            brief: null,
            sourcePath: "briefs/hatch-demo.brief.json",
          },
        ],
        page: { returned: 1, total: 1 },
        query: { detail: "summary", projectId: "hatch-demo" },
      },
      ok: true,
    });
    expect(full.structuredContent).toMatchObject({
      data: {
        items: [
          {
            brief: {
              assetId: "product-foundation",
              assetVersion: "1.0.0",
            },
          },
        ],
      },
      ok: true,
    });
  });

  it("returns exact Token definitions with their validated dependencies", async () => {
    const result = await client.callTool({
      arguments: {
        assetId: "button-foundation",
        assetVersion: "1.0.0",
        detail: "definitions",
        modeId: "light",
        paths: ["semantic.color.action-primary-background"],
      },
      name: HATCHKIT_TOKEN_QUERY_TOOL_NAME,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        items: [
          {
            definitions: [
              { path: "primitive.color.brand-600", requested: false },
              {
                path: "semantic.color.action-primary-background",
                requested: true,
              },
            ],
            modeId: "light",
            sourcePath: "tokens/button-foundation.tokens.json",
            unmatchedPaths: [],
          },
        ],
      },
      ok: true,
    });
  });

  it("searches Components exactly and never returns Figma locators", async () => {
    const exact = await client.callTool({
      arguments: { term: "Button" },
      name: HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
    });
    const typo = await client.callTool({
      arguments: { term: "buton" },
      name: HATCHKIT_COMPONENT_SEARCH_TOOL_NAME,
    });

    expect(exact.structuredContent).toMatchObject({
      data: {
        items: [
          {
            asset: { id: "button", version: "1.0.0" },
            availability: "figma-ready",
            matchFields: ["assetId", "name"],
            sources: {
              contractSourcePath: "components/button.component.json",
              registrySourcePath: "registry/components.registry.json",
            },
          },
        ],
        page: { returned: 1, total: 1 },
      },
      ok: true,
    });
    expect(typo.structuredContent).toMatchObject({
      data: { items: [], page: { returned: 0, total: 0 } },
      ok: true,
    });
    expect(JSON.stringify(exact)).not.toContain("nodeId");
    expect(JSON.stringify(exact)).not.toContain("componentSetKey");
    expect(JSON.stringify(exact)).not.toContain("fileBindingId");
  });

  it("returns a Toolkit Failure for a well-formed missing exact Brief", async () => {
    const result = await client.callTool({
      arguments: {
        assetId: "missing-brief",
        assetVersion: "1.0.0",
        detail: "full",
      },
      name: HATCHKIT_BRIEF_QUERY_TOOL_NAME,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).toContain("IDENTITY_NOT_FOUND");
    expect(JSON.stringify(result)).not.toContain(WORKSPACE_ROOT);
  });

  it("rejects malformed full-detail input at the MCP contract boundary", async () => {
    const result = await client.callTool({
      arguments: { detail: "full" },
      name: HATCHKIT_BRIEF_QUERY_TOOL_NAME,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).toContain("Input validation error");
  });
});
