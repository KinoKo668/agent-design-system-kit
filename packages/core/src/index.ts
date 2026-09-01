export const CORE_PACKAGE_NAME = "@agent-design-system-kit/core" as const;

export type CorePackageName = typeof CORE_PACKAGE_NAME;

export * from "./button-contract.js";
export * from "./component-registry.js";
export * from "./design-brief.js";
export * from "./errors.js";
export * from "./json.js";
export * from "./logging.js";
export * from "./results.js";
export * from "./security.js";
export * from "./schema-primitives.js";
export * from "./schema-validation.js";
export * from "./token-set.js";
