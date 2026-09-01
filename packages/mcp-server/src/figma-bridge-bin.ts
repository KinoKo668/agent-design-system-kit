#!/usr/bin/env node

import process from "node:process";

import { createFigmaBridge } from "./figma-bridge.js";

const bridge = createFigmaBridge();

try {
  const address = await bridge.start();
  process.stdout.write(
    [
      `Hatchkit Figma Bridge: ${address.pluginUrl}`,
      "Session Token (shown once; keep it private):",
      bridge.getSessionToken(),
      "Paste the token into Hatchkit Writer. Press Ctrl+C to stop.",
      "",
    ].join("\n"),
  );
} catch {
  process.stderr.write(
    "Hatchkit Figma Bridge could not start on localhost:38451.\n",
  );
  process.exitCode = 1;
}

let closing = false;
async function close(): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  await bridge.close();
  process.exitCode = 0;
}

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
