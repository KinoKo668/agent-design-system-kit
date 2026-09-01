import process from "node:process";
import { spawn } from "node:child_process";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const SERVER_ARGUMENTS = [
  "packages/mcp-server/dist/bin.js",
  "--project",
  "hatch-demo",
  "--root",
  "design-system/hatch-demo",
];
const EXPECTED_TOOL_NAMES = [
  "hatchkit_status",
  "hatchkit_query_briefs",
  "hatchkit_query_tokens",
  "hatchkit_search_components",
  "hatchkit_resolve_component",
  "hatchkit_request_component_change",
];

async function captureProcess(arguments_) {
  const child = spawn(process.execPath, arguments_, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal, stderr, stdout });
    });
  });
}

async function verifyStartupBoundaries() {
  const invalid = await captureProcess([
    "packages/mcp-server/dist/bin.js",
    "--project",
    "hatch-demo",
  ]);
  if (invalid.code !== 2 || invalid.signal !== null) {
    throw new Error("invalid startup did not exit deterministically.");
  }
  if (invalid.stdout !== "") {
    throw new Error("invalid startup polluted MCP stdout.");
  }
  if (
    !invalid.stderr.includes('"ok": false') ||
    invalid.stderr.includes(process.cwd())
  ) {
    throw new Error("invalid startup stderr was incomplete or unsafe.");
  }

  const help = await captureProcess([
    "packages/mcp-server/dist/bin.js",
    "--help",
  ]);
  if (
    help.code !== 0 ||
    help.signal !== null ||
    help.stderr !== "" ||
    !help.stdout.includes("Protocol messages are the only stdout output.")
  ) {
    throw new Error("help startup boundary did not match its contract.");
  }
}

async function verifyConnection(label, versionNegotiation) {
  const transport = new StdioClientTransport({
    args: SERVER_ARGUMENTS,
    command: process.execPath,
    cwd: process.cwd(),
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client(
    { name: `hatchkit-${label}-smoke`, version: "1.0.0" },
    { versionNegotiation },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (
      JSON.stringify(tools.tools.map(({ name }) => name)) !==
      JSON.stringify(EXPECTED_TOOL_NAMES)
    ) {
      throw new Error(`${label}: Hatchkit tools were not fully discoverable.`);
    }
    if (
      tools.tools.some(
        ({ annotations }) =>
          annotations?.readOnlyHint !== true ||
          annotations.destructiveHint !== false ||
          annotations.openWorldHint !== false,
      )
    ) {
      throw new Error(`${label}: a Hatchkit tool was not declared read-only.`);
    }
    const status = await client.callTool({
      arguments: {},
      name: "hatchkit_status",
    });
    if (
      status.isError === true ||
      status.structuredContent?.data?.status !== "ready"
    ) {
      throw new Error(`${label}: hatchkit_status did not report readiness.`);
    }
    const briefs = await client.callTool({
      arguments: {},
      name: "hatchkit_query_briefs",
    });
    if (
      briefs.isError === true ||
      briefs.structuredContent?.data?.page?.total !== 1
    ) {
      throw new Error(`${label}: Brief summaries were not queryable.`);
    }
    const tokens = await client.callTool({
      arguments: {
        assetId: "button-foundation",
        assetVersion: "1.0.0",
        detail: "definitions",
        modeId: "light",
        paths: ["semantic.color.action-primary-background"],
      },
      name: "hatchkit_query_tokens",
    });
    if (
      tokens.isError === true ||
      tokens.structuredContent?.data?.items?.[0]?.definitions?.length !== 2
    ) {
      throw new Error(`${label}: exact Token definitions were not queryable.`);
    }
    const components = await client.callTool({
      arguments: { term: "Button" },
      name: "hatchkit_search_components",
    });
    if (
      components.isError === true ||
      components.structuredContent?.data?.page?.total !== 1 ||
      JSON.stringify(components).includes("nodeId")
    ) {
      throw new Error(`${label}: Component search was incomplete or unsafe.`);
    }
    const resolution = await client.callTool({
      arguments: {
        assetId: "button",
        variantSelections: { appearance: "secondary", state: "disabled" },
      },
      name: "hatchkit_resolve_component",
    });
    if (
      resolution.isError === true ||
      resolution.structuredContent?.data?.status !== "figma-ready" ||
      resolution.structuredContent?.data?.selectedVariant?.id !==
        "appearance-secondary/state-disabled"
    ) {
      throw new Error(`${label}: exact Component resolution failed.`);
    }
    const changeRequest = await client.callTool({
      arguments: {
        assetId: "select",
        submission: {
          intendedUse: "Use Select in a settings form without one-off UI.",
          rationale: "No exact Select component is registered.",
          requestId: "00000000-0000-4000-8000-000000000032",
          submittedAt: "2026-09-01T16:50:00Z",
          submittedBy: { id: "codex", type: "agent" },
          summary: "Review a missing Select component",
        },
      },
      name: "hatchkit_request_component_change",
    });
    if (
      changeRequest.isError === true ||
      changeRequest.structuredContent?.data?.outcome !==
        "change-request-required" ||
      JSON.stringify(changeRequest).includes("nodeId")
    ) {
      throw new Error(`${label}: safe Component Change Request failed.`);
    }
    if (!client.getInstructions()?.startsWith("Hatchkit is a local")) {
      throw new Error(`${label}: server instructions were not initialized.`);
    }
  } finally {
    await client.close();
  }
  if (stderr.length > 0) {
    throw new Error(`${label}: server wrote unexpected stderr output.`);
  }
}

await verifyStartupBoundaries();
await verifyConnection("legacy", { mode: "legacy" });
await verifyConnection("modern", {
  mode: "auto",
  probe: { maxRetries: 0, timeoutMs: 5_000 },
});
process.stdout.write(
  "Hatchkit MCP stdio startup boundaries and legacy/modern negotiation passed.\n",
);
