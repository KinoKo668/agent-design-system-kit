import { CORE_PACKAGE_NAME } from "@agent-design-system-kit/core";

export * from "./approval-verifier.js";
export * from "./registry-files.js";
export * from "./figma-bridge.js";
export * from "./figma-bridge-launch.js";
export * from "./button-instance-loop.js";
export * from "./local-writer-client.js";
export * from "./operation-log.js";
export * from "./query-tools.js";
export * from "./resolution-tools.js";
export * from "./server.js";
export * from "./stdio.js";
export * from "./style-audit-loop.js";
export * from "./writer-queue.js";
export * from "./write-tools.js";

export const MCP_SERVER_PACKAGE_NAME =
  "@agent-design-system-kit/mcp-server" as const;
export const MCP_SERVER_PACKAGE_DEPENDENCIES = [CORE_PACKAGE_NAME] as const;
