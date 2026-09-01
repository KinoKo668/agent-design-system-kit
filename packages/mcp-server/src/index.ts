import { CORE_PACKAGE_NAME } from "@agent-design-system-kit/core";

export * from "./registry-files.js";

export const MCP_SERVER_PACKAGE_NAME =
  "@agent-design-system-kit/mcp-server" as const;
export const MCP_SERVER_PACKAGE_DEPENDENCIES = [CORE_PACKAGE_NAME] as const;
