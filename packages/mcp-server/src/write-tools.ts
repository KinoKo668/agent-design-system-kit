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
import {
  runStyleAuditLoop,
  styleAuditLoopInputSchema,
  styleAuditLoopOutputSchema,
} from "./style-audit-loop.js";
import {
  componentAuditLoopInputSchema,
  componentAuditLoopOutputSchema,
  runComponentAuditLoop,
} from "./component-audit-loop.js";
import {
  registryDriftAuditLoopInputSchema,
  registryDriftAuditLoopOutputSchema,
  runRegistryDriftAuditLoop,
} from "./registry-drift-audit-loop.js";
import {
  iconInstanceLoopInputSchema,
  iconInstanceLoopOutputSchema,
  runIconInstanceLoop,
} from "./icon-instance-loop.js";
import {
  inputInstanceLoopInputSchema,
  inputInstanceLoopOutputSchema,
  runInputInstanceLoop,
} from "./input-instance-loop.js";
import {
  componentEnsureLoopInputSchema,
  componentEnsureLoopOutputSchema,
  runComponentEnsureLoop,
  runVariablesEnsureLoop,
  variablesEnsureLoopInputSchema,
  variablesEnsureLoopOutputSchema,
} from "./library-ensure-loop.js";

export const HATCHKIT_BUTTON_INSTANCE_INSERT_TOOL_NAME =
  "hatchkit_insert_button_instance" as const;
export const HATCHKIT_ICON_INSTANCE_INSERT_TOOL_NAME =
  "hatchkit_insert_icon_instance" as const;
export const HATCHKIT_INPUT_INSTANCE_INSERT_TOOL_NAME =
  "hatchkit_insert_input_instance" as const;
export const HATCHKIT_VARIABLES_ENSURE_TOOL_NAME =
  "hatchkit_ensure_variables" as const;
export const HATCHKIT_COMPONENT_ENSURE_TOOL_NAME =
  "hatchkit_ensure_component" as const;
export const HATCHKIT_STYLE_AUDIT_TOOL_NAME = "hatchkit_audit_styles" as const;
export const HATCHKIT_COMPONENT_AUDIT_TOOL_NAME =
  "hatchkit_audit_components" as const;
export const HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME =
  "hatchkit_audit_registry_drift" as const;

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

export const hatchkitIconInstanceInsertInputSchema =
  iconInstanceLoopInputSchema.extend({
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

export const hatchkitInputInstanceInsertInputSchema =
  inputInstanceLoopInputSchema.extend({
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

const ensureWaitSchema = {
  waitTimeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(30_000)
    .describe(
      "How long to wait for the connected Figma Plugin before returning a resumable timeout.",
    ),
} as const;

export const hatchkitVariablesEnsureInputSchema =
  variablesEnsureLoopInputSchema.extend(ensureWaitSchema);
export const hatchkitComponentEnsureInputSchema =
  componentEnsureLoopInputSchema.extend(ensureWaitSchema);

export interface HatchkitWriteToolOptions extends HatchkitCatalogOptions {
  readonly writer: LocalWriterClient;
}

export function registerHatchkitWriteTools(
  server: McpServer,
  options: HatchkitWriteToolOptions,
): void {
  server.registerTool(
    HATCHKIT_VARIABLES_ENSURE_TOOL_NAME,
    {
      annotations: HATCHKIT_ADDITIVE_WRITE_TOOL_ANNOTATIONS,
      description:
        "Resolve one exact Token Set from the validated Git catalog, derive its unique Figma library binding from active Component Registry references, rebuild the deterministic approved Variable plan, and converge the real Figma Variable Collection through the authenticated single Writer. Call this before ensuring a Component that uses the Token Set.",
      inputSchema: hatchkitVariablesEnsureInputSchema,
      outputSchema: variablesEnsureLoopOutputSchema,
      title: "Ensure approved Figma Variables",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runVariablesEnsureLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_COMPONENT_ENSURE_TOOL_NAME,
    {
      annotations: HATCHKIT_ADDITIVE_WRITE_TOOL_ANNOTATIONS,
      description:
        "Resolve one exact active Button, Icon, or Input Contract and Registry entry, rebuild its profile-specific deterministic plan from current Git source and Token dependency, converge the real Figma Main Component Set through the authenticated single Writer, and atomically finalize its Ready locator. Its Variables must already exist in the bound file.",
      inputSchema: hatchkitComponentEnsureInputSchema,
      outputSchema: componentEnsureLoopOutputSchema,
      title: "Ensure an approved Figma Component Set",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runComponentEnsureLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_INPUT_INSTANCE_INSERT_TOOL_NAME,
    {
      annotations: HATCHKIT_ADDITIVE_WRITE_TOOL_ANNOTATIONS,
      description:
        "Resolve one exact Ready Input State and Content from the current Git Registry, build the deterministic approved plan, insert one real Figma Instance through the authenticated single Writer, and return its audited result. Label, field text, and nearby supporting or error text are explicit governed properties.",
      inputSchema: hatchkitInputInstanceInsertInputSchema,
      outputSchema: inputInstanceLoopOutputSchema,
      title: "Insert an approved Input Instance",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runInputInstanceLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_ICON_INSTANCE_INSERT_TOOL_NAME,
    {
      annotations: HATCHKIT_ADDITIVE_WRITE_TOOL_ANNOTATIONS,
      description:
        "Resolve one exact Ready Icon and Size from the current Git Registry, build the deterministic approved plan, insert one real Figma Instance through the authenticated single Writer, and return its audited result. The 44px interactive target remains the consumer component's responsibility.",
      inputSchema: hatchkitIconInstanceInsertInputSchema,
      outputSchema: iconInstanceLoopOutputSchema,
      title: "Insert an approved Icon Instance",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runIconInstanceLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_REGISTRY_DRIFT_AUDIT_TOOL_NAME,
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Scan the entire bound Figma library without modifying it. Compare every Hatchkit-managed Variable Collection and Component Set against the active Git Registry, including stable identity, version, content digest, locator, and exact child assets. Use a new requestId after Git or Figma changes.",
      inputSchema: registryDriftAuditLoopInputSchema.extend({
        waitTimeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
      }),
      outputSchema: registryDriftAuditLoopOutputSchema,
      title: "Audit Registry and Figma library drift",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runRegistryDriftAuditLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_COMPONENT_AUDIT_TOOL_NAME,
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Scan the current bound Figma page without modifying it. Verify that managed component-shaped nodes remain real Instances, that every Instance source belongs to the active Git Registry, and that its Variant and provenance match the approved Component Contract. Use a new requestId after the page changes.",
      inputSchema: componentAuditLoopInputSchema.extend({
        waitTimeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
      }),
      outputSchema: componentAuditLoopOutputSchema,
      title: "Audit current-page component provenance",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runComponentAuditLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

  server.registerTool(
    HATCHKIT_STYLE_AUDIT_TOOL_NAME,
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Scan the current bound Figma page without modifying it. Compare active visual fields against Variables registered by the current Git Token Sets and return exact node/field findings for hard-coded styles or unregistered Variable bindings. Use a new requestId after the page changes.",
      inputSchema: styleAuditLoopInputSchema.extend({
        waitTimeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
      }),
      outputSchema: styleAuditLoopOutputSchema,
      title: "Audit current-page style bindings",
    },
    async ({ waitTimeoutMs, ...request }) =>
      toMcpToolResponse(
        await withDesignSystemSnapshot(options, (snapshot) =>
          runStyleAuditLoop(snapshot, request, options, {
            timeoutMs: waitTimeoutMs,
          }),
        ),
      ),
  );

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
