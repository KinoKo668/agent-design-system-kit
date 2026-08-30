import { CORE_PACKAGE_NAME } from "@agent-design-system-kit/core";

export const CLI_PACKAGE_NAME = "@agent-design-system-kit/cli" as const;
export const CLI_PACKAGE_DEPENDENCIES = [CORE_PACKAGE_NAME] as const;
