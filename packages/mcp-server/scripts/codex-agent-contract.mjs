import { execFileSync, spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const CONTRACT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../contracts");
const PROMPT_PATH = join(CONTRACT_DIRECTORY, "codex-button-ready.prompt.md");
const OUTPUT_SCHEMA_PATH = join(
  CONTRACT_DIRECTORY,
  "codex-button-ready.output.schema.json",
);
const EXPECTED_PATH = join(
  CONTRACT_DIRECTORY,
  "codex-button-ready.expected.json",
);
const SERVER_PATH = join(WORKSPACE_ROOT, "packages/mcp-server/dist/bin.js");
const DESIGN_SYSTEM_ROOT = "design-system/hatch-demo";
const EXPECTED_TOOL_SEQUENCE = [
  "hatchkit_status",
  "hatchkit_search_components",
  "hatchkit_resolve_component",
];
const MAX_CAPTURE_BYTES = 8 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 180_000;

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function gitStatusSnapshot() {
  return execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: WORKSPACE_ROOT },
  );
}

function sanitizeDiagnostic(value) {
  return value
    .replaceAll(WORKSPACE_ROOT, "<workspace>")
    .replace(/\/Users\/[^/\s]+/gu, "<user-home>");
}

function isWorkingCodexBinary(candidate) {
  const result = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  return result.status === 0 && result.signal === null;
}

function resolveCodexBinary() {
  const explicit = process.env.HATCHKIT_CODEX_BIN;
  if (explicit !== undefined && explicit.length > 0) {
    if (!isWorkingCodexBinary(explicit)) {
      throw new Error(
        "HATCHKIT_CODEX_BIN does not identify a working Codex CLI.",
      );
    }
    return explicit;
  }
  const candidates = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((directory) => directory.length > 0)
    .map((directory) => join(directory, "codex"));
  for (const candidate of new Set(candidates)) {
    if (isWorkingCodexBinary(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "No working Codex CLI was found on PATH. Set HATCHKIT_CODEX_BIN explicitly.",
  );
}

async function runCodex(codexBinary, arguments_, timeoutMs) {
  const child = spawn(codexBinary, arguments_, {
    cwd: WORKSPACE_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  let captureExceeded = false;
  const append = (current, chunk) => {
    const next = current + chunk;
    if (Buffer.byteLength(next) > MAX_CAPTURE_BYTES) {
      captureExceeded = true;
      child.kill("SIGTERM");
      return current;
    }
    return next;
  };
  child.stdout.on("data", (chunk) => {
    stdout = append(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = append(stderr, chunk);
  });

  return await new Promise((resolvePromise, rejectPromise) => {
    let timedOut = false;
    let forceKillTimeout;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);
      rejectPromise(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);
      if (timedOut) {
        rejectPromise(
          new Error(
            `Codex Agent contract timed out after ${String(timeoutMs)}ms.`,
          ),
        );
        return;
      }
      if (captureExceeded) {
        rejectPromise(
          new Error("Codex Agent contract output exceeded the capture limit."),
        );
        return;
      }
      resolvePromise({ code, signal, stderr, stdout });
    });
  });
}

function parseEvents(stdout) {
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(
          `Codex JSONL line ${String(index + 1)} was not valid JSON.`,
        );
      }
    });
}

function completedMcpCalls(events) {
  return events.flatMap((event) => {
    const item = event?.item;
    return event?.type === "item.completed" && item?.type === "mcp_tool_call"
      ? [item]
      : [];
  });
}

function assertEventContract(events) {
  const forbiddenItemTypes = new Set([
    "command_execution",
    "file_change",
    "shell_command",
    "web_search",
  ]);
  for (const event of events) {
    if (forbiddenItemTypes.has(event?.item?.type)) {
      throw new Error(
        `Codex used forbidden item type '${String(event.item.type)}'.`,
      );
    }
  }

  const calls = completedMcpCalls(events);
  const sequence = calls.map(({ tool }) => tool);
  if (!isDeepStrictEqual(sequence, EXPECTED_TOOL_SEQUENCE)) {
    throw new Error(
      `Expected MCP Tool sequence ${JSON.stringify(EXPECTED_TOOL_SEQUENCE)}, received ${JSON.stringify(sequence)}.`,
    );
  }
  for (const call of calls) {
    if (
      call.server !== "hatchkit" ||
      call.status !== "completed" ||
      call.error !== null
    ) {
      throw new Error(
        `MCP Tool '${String(call.tool)}' did not complete safely.`,
      );
    }
  }
  if (!events.some(({ type }) => type === "turn.completed")) {
    throw new Error("Codex Agent contract did not complete its turn.");
  }
}

function codexArguments(prompt, outputPath) {
  const enabledTools = JSON.stringify(EXPECTED_TOOL_SEQUENCE);
  const serverArguments = JSON.stringify([
    "packages/mcp-server/dist/bin.js",
    "--project",
    "hatch-demo",
    "--root",
    DESIGN_SYSTEM_ROOT,
  ]);
  const arguments_ = [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--json",
    "--color",
    "never",
    "--output-schema",
    OUTPUT_SCHEMA_PATH,
    "--output-last-message",
    outputPath,
    "-C",
    WORKSPACE_ROOT,
    "-c",
    `mcp_servers.hatchkit.command=${JSON.stringify(process.execPath)}`,
    "-c",
    `mcp_servers.hatchkit.args=${serverArguments}`,
    "-c",
    `mcp_servers.hatchkit.cwd=${JSON.stringify(WORKSPACE_ROOT)}`,
    "-c",
    "mcp_servers.hatchkit.enabled=true",
    "-c",
    `mcp_servers.hatchkit.enabled_tools=${enabledTools}`,
    "-c",
    'mcp_servers.hatchkit.default_tools_approval_mode="auto"',
  ];
  const model = process.env.HATCHKIT_CODEX_MODEL;
  if (model !== undefined && model.length > 0) {
    arguments_.push("--model", model);
  }
  arguments_.push(prompt);
  return arguments_;
}

await Promise.all([
  access(SERVER_PATH, constants.R_OK),
  access(PROMPT_PATH, constants.R_OK),
  access(OUTPUT_SCHEMA_PATH, constants.R_OK),
  access(EXPECTED_PATH, constants.R_OK),
]);

const beforeStatus = gitStatusSnapshot();
const codexBinary = resolveCodexBinary();
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "hatchkit-codex-contract-"),
);
try {
  const outputPath = join(temporaryDirectory, "last-message.json");
  const [prompt, expectedText] = await Promise.all([
    readFile(PROMPT_PATH, "utf8"),
    readFile(EXPECTED_PATH, "utf8"),
  ]);
  const timeoutMs = parsePositiveInteger(
    process.env.HATCHKIT_CODEX_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "HATCHKIT_CODEX_TIMEOUT_MS",
  );
  const execution = await runCodex(
    codexBinary,
    codexArguments(prompt, outputPath),
    timeoutMs,
  );
  if (execution.code !== 0 || execution.signal !== null) {
    const diagnostic = sanitizeDiagnostic(execution.stderr).slice(-8_000);
    throw new Error(
      `Codex Agent contract exited with code ${String(execution.code)} and signal ${String(execution.signal)}.\n${diagnostic}`,
    );
  }
  const events = parseEvents(execution.stdout);
  assertEventContract(events);
  const actualText = await readFile(outputPath, "utf8");
  const actual = JSON.parse(actualText);
  const expected = JSON.parse(expectedText);
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `Codex final result did not match the contract.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
    );
  }
  const afterStatus = gitStatusSnapshot();
  if (!beforeStatus.equals(afterStatus)) {
    throw new Error("Codex Agent contract changed the workspace status.");
  }
  process.stdout.write(
    "Hatchkit Codex Agent contract passed: status → search → resolve, no shell or workspace changes.\n",
  );
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
