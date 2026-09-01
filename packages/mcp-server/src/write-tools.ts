import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import {
  buttonInstanceLoopInputSchema,
  buttonInstanceLoopOutputSchema,
  runButtonInstanceLoop,
} from "./button-instance-loop.js";
import type { LocalWriterClient } from "./local-writer-client.js";
import {
  toMcpToolResponse,
  withDesignSystemSnapshot,
  type HatchkitCatalogOptions,
} from "./tool-support.js";

export const HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME =
  "hatchkit_insert_button_instance" as const;

export const HATCHKIT_ADDITIVE_WRITE_TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: false,
} as const;

export const hatchkitButtonInstanceInsertInputSchema =
  buttonInstanceLoopInputSchema.extend({
    waitTimeoutMs: z
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000)
      .describe(
        "How long to wait for the connected Figma Plugin before returning a resumable timeout.",
      ),
  });

export interface HatchkitWriteToolOptions extends HatchkitCatalogOptions {
  readonly writer: LocalWriterClient;
}

export function registerHatchkitWriteTools(
  server: McpServer,
  options: HatchkitWriteToolOptions,
): void {
  server.registerTool(
    HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME,
    {
      annotations: HATCHKIT_ADDITIVE_WRITE_TOOL_ANNOTATIONS,
      description:
        "Resolve one exact Ready Button and Variant from the current Git Registry, build the deterministic approved plan, submit one additive Instance insertion to the authenticated local Figma Writer, wait for completion, and return the audited result. Calling this tool is an explicit Figma write request; use a stable requestId for exact retries.",
      inputSchema: hatchkitButtonInstanceInsertInputSchema,
      outputSchema: buttonInstanceLoopOutputSchema,
      title: "Insert an approved Button Instance",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runButtonInstanceLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );
}
