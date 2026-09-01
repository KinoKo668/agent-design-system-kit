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
    if (!tools.tools.some((tool) => tool.name === "hatchkit_status")) {
      throw new Error(`${label}: hatchkit_status was not discoverable.`);
    }
    const result = await client.callTool({
      arguments: {},
      name: "hatchkit_status",
    });
    if (
      result.isError === true ||
      result.structuredContent?.data?.status !== "ready"
    ) {
      throw new Error(`${label}: hatchkit_status did not report readiness.`);
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
