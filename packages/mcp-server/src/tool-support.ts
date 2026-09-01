import * as z from "zod";

import type {
  DesignSystemSnapshot,
  ToolkitResult,
} from "@agent-design-system-kit/core";

import { loadDesignSystemFromDirectory } from "./registry-files.js";

export interface HatchkitCatalogOptions {
  readonly designSystemRoot: string;
  readonly expectedProjectId: string;
}

export const HATCHKIT_READ_ONLY_TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const;

export const TOOLKIT_SUCCESS_ENVELOPE_SHAPE = {
  ok: z.literal(true),
  schemaVersion: z.literal("1.0.0"),
  warnings: z.array(z.unknown()),
};

export function toMcpToolResponse(result: ToolkitResult<unknown>) {
  const text = JSON.stringify(result, null, 2);
  return result.ok
    ? {
        content: [{ text, type: "text" as const }],
        structuredContent: result,
      }
    : {
        content: [{ text, type: "text" as const }],
        isError: true as const,
      };
}

export async function withDesignSystemSnapshot<T>(
  options: HatchkitCatalogOptions,
  query: (
    snapshot: DesignSystemSnapshot,
  ) => ToolkitResult<T> | Promise<ToolkitResult<T>>,
): Promise<ToolkitResult<T>> {
  const snapshotResult = await loadDesignSystemFromDirectory({
    designSystemRoot: options.designSystemRoot,
    expectedProjectId: options.expectedProjectId,
  });
  return snapshotResult.ok ? await query(snapshotResult.data) : snapshotResult;
}
