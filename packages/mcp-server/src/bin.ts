#!/usr/bin/env node

import process from "node:process";

import {
  HATCHKIT_MCP_HELP,
  parseHatchkitMcpArguments,
  startHatchkitMcpStdioServer,
} from "./stdio.js";
import { createLocalWriterClient } from "./local-writer-client.js";

const parsed = parseHatchkitMcpArguments(process.argv.slice(2), process.env);
if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed, null, 2)}\n`);
  process.exitCode = 2;
} else if (parsed.data.showHelp) {
  process.stdout.write(`${HATCHKIT_MCP_HELP}\n`);
} else {
  const { writerOptions, ...serverOptions } = parsed.data;
  const handle = startHatchkitMcpStdioServer(
    {
      ...serverOptions,
      ...(writerOptions === undefined
        ? {}
        : { writer: createLocalWriterClient(writerOptions) }),
    },
    {
      onError: () => {
        process.stderr.write("Hatchkit MCP stdio transport error.\n");
      },
    },
  );
  const close = async (): Promise<void> => {
    await handle.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
