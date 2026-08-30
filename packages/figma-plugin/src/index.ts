import { CORE_PACKAGE_NAME } from "@agent-design-system-kit/core";

export const FIGMA_PLUGIN_PACKAGE_NAME =
  "@agent-design-system-kit/figma-plugin" as const;
export const FIGMA_PLUGIN_PACKAGE_DEPENDENCIES = [CORE_PACKAGE_NAME] as const;
