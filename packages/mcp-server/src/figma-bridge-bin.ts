#!/usr/bin/env node

import process from "node:process";

import { createGitApprovalVerifier } from "./approval-verifier.js";
import { createFigmaBridge } from "./figma-bridge.js";
import {
  HATCHKIT_FIGMA_BRIDGE_HELP,
  parseFigmaBridgeArguments,
} from "./figma-bridge-launch.js";

const parsed = parseFigmaBridgeArguments(process.argv.slice(2), process.env);
if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed, null, 2)}\n`);
  process.exitCode = 2;
} else if (parsed.data.showHelp) {
  process.stdout.write(`${HATCHKIT_FIGMA_BRIDGE_HELP}\n`);
} else {
  const approvalVerifier = parsed.data.approvalVerifier;
  const bridge = createFigmaBridge({
    ...(approvalVerifier === null
      ? {}
      : { authorizeWrite: createGitApprovalVerifier(approvalVerifier) }),
  });

  try {
    const address = await bridge.start();
    process.stdout.write(
      [
        `Hatchkit Figma Bridge: ${address.pluginUrl}`,
        approvalVerifier === null
          ? "Write authorization: diagnostic only; all Figma writes are blocked."
          : `Write authorization: Git Approval verifier active for '${approvalVerifier.expectedProjectId}'.`,
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
    if (closing) return;
    closing = true;
    await bridge.close();
    process.exitCode = 0;
  }

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
