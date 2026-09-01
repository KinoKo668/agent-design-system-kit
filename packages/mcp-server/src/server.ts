import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import {
  createSuccessResult,
  type ToolkitResult,
} from "@agent-design-system-kit/core";

import { loadDesignSystemFromDirectory } from "./registry-files.js";
import { registerHatchkitQueryTools } from "./query-tools.js";
import { registerHatchkitResolutionTools } from "./resolution-tools.js";

export const HATCHKIT_MCP_SERVER_NAME = "hatchkit" as const;
export const HATCHKIT_MCP_SERVER_VERSION = "0.0.0" as const;
export const HATCHKIT_STATUS_TOOL_NAME = "hatchkit_status" as const;
export const HATCHKIT_MCP_SERVER_INSTRUCTIONS =
  "Hatchkit is a local, read-only design-system control plane. Call hatchkit_status before catalog queries. Use only exact registered component identities and variants. Never invent, approximate, or silently fall back to inactive assets. A successful lookup does not authorize Figma writes: approval and audit gates still apply. When no exact capability exists, stop and request a structured component change." as const;

export interface HatchkitMcpServerOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
}

const statusOutputSchema = z.strictObject({
  data: z.strictObject({
    catalog: z.strictObject({
      counts: z.strictObject({
        approvals: z.number().int().nonnegative(),
        briefs: z.number().int().nonnegative(),
        components: z.number().int().nonnegative(),
        registries: z.number().int().nonnegative(),
        tokenSets: z.number().int().nonnegative(),
      }),
      projectId: z.string(),
      sources: z.array(z.string()),
    }),
    server: z.strictObject({
      access: z.literal("read-only"),
      name: z.literal(HATCHKIT_MCP_SERVER_NAME),
      transport: z.literal("stdio"),
      version: z.literal(HATCHKIT_MCP_SERVER_VERSION),
    }),
    status: z.literal("ready"),
  }),
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
});

type StatusResult = z.infer<typeof statusOutputSchema>;

function stringifyResult(result: ToolkitResult<unknown>): string {
  return JSON.stringify(result, null, 2);
}

async function createStatusResult(
  options: HatchkitMcpServerOptions,
): Promise<ToolkitResult<StatusResult["data"]>> {
  const snapshotResult = await loadDesignSystemFromDirectory({
    designSystemRoot: options.designSystemRoot,
    expectedProjectId: options.expectedProjectId,
  });
  if (!snapshotResult.ok) {
    return snapshotResult;
  }
  const snapshot = snapshotResult.data;
  return createSuccessResult({
    catalog: {
      counts: {
        approvals: snapshot.approvals.length,
        briefs: snapshot.briefs.length,
        components: snapshot.components.length,
        registries: snapshot.registries.length,
        tokenSets: snapshot.tokenSets.length,
      },
      projectId: snapshot.projectId,
      sources: [
        ...snapshot.approvals.map(({ sourcePath }) => sourcePath),
        ...snapshot.briefs.map(({ sourcePath }) => sourcePath),
        ...snapshot.components.map(({ sourcePath }) => sourcePath),
        ...snapshot.registries.map(({ sourcePath }) => sourcePath),
        ...snapshot.tokenSets.map(({ sourcePath }) => sourcePath),
      ].sort(),
    },
    server: {
      access: "read-only",
      name: HATCHKIT_MCP_SERVER_NAME,
      transport: "stdio",
      version: HATCHKIT_MCP_SERVER_VERSION,
    },
    status: "ready",
  });
}

export function createHatchkitMcpServer(
  options: HatchkitMcpServerOptions,
): McpServer {
  const server = new McpServer(
    {
      name: HATCHKIT_MCP_SERVER_NAME,
      version: HATCHKIT_MCP_SERVER_VERSION,
    },
    {
      instructions: HATCHKIT_MCP_SERVER_INSTRUCTIONS,
    },
  );

  server.registerTool(
    HATCHKIT_STATUS_TOOL_NAME,
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Validate the configured local Hatchkit catalog and report read-only server readiness. Call this before other design-system tools.",
      inputSchema: z.strictObject({}),
      outputSchema: statusOutputSchema,
      title: "Check Hatchkit status",
    },
    async () => {
      const result = await createStatusResult(options);
      const text = stringifyResult(result);
      return result.ok
        ? {
            content: [{ text, type: "text" }],
            structuredContent: result,
          }
        : {
            content: [{ text, type: "text" }],
            isError: true,
          };
    },
  );

  registerHatchkitQueryTools(server, options);
  registerHatchkitResolutionTools(server, options);

  return server;
}
