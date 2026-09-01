import type {
  ErrorCode,
  FigmaComponentAuditFinding,
  FigmaComponentAuditPlan,
  FigmaComponentAuditResult,
  FigmaComponentObservation,
  JsonObject,
} from "@agent-design-system-kit/core";

import {
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export interface FigmaComponentAuditPort {
  readonly document: SharedPluginDataPort;
  getCurrentPage(): { readonly id: string; readonly name: string };
  getComponentObservations(): Promise<readonly FigmaComponentObservation[]>;
}

export class ComponentAuditError extends Error {
  readonly code: ErrorCode;
  readonly recoveryInstruction: string;

  constructor(input: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly recoveryInstruction: string;
  }) {
    super(input.message);
    this.name = "ComponentAuditError";
    this.code = input.code;
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

function finding(
  code: FigmaComponentAuditFinding["code"],
  observation: FigmaComponentObservation,
  actual: JsonObject,
  expected: JsonObject,
  recoveryInstruction: string,
): FigmaComponentAuditFinding {
  return {
    actual,
    code,
    expected,
    node: observation.node,
    recoveryInstruction,
    severity: "error",
  };
}

export async function runFigmaComponentAudit(
  port: FigmaComponentAuditPort,
  plan: FigmaComponentAuditPlan,
): Promise<FigmaComponentAuditResult> {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== plan.projectId ||
    binding.fileBindingId !== plan.fileBindingId
  ) {
    throw new ComponentAuditError({
      code: "FILE_BINDING_MISMATCH",
      message: "The open Figma file does not match the component audit plan.",
      recoveryInstruction:
        "Open the exact registered Figma file and retry the read-only audit.",
    });
  }
  const observations = await port.getComponentObservations();
  if (observations.length > 10_000) {
    throw new ComponentAuditError({
      code: "VALIDATION_FAILED",
      message:
        "The current page exceeds the 10,000-node component audit limit.",
      recoveryInstruction:
        "Split the page into smaller auditable scopes before retrying.",
    });
  }
  const sources = new Map(
    plan.sources.map((source) => [source.componentSetStableId, source]),
  );
  const findings: FigmaComponentAuditFinding[] = [];
  let compliantInstances = 0;
  for (const observation of observations) {
    const nodeFindings: FigmaComponentAuditFinding[] = [];
    if (observation.source === null) {
      nodeFindings.push(
        finding(
          "DETACHED_OR_APPROXIMATE_COMPONENT",
          observation,
          { nodeType: observation.node.type },
          { nodeType: "INSTANCE" },
          "Replace the detached or approximate node with a real registered Figma Instance.",
        ),
      );
    } else {
      const source =
        observation.source.componentSetStableId === null
          ? undefined
          : sources.get(observation.source.componentSetStableId);
      if (source === undefined) {
        nodeFindings.push(
          finding(
            "UNREGISTERED_COMPONENT_SOURCE",
            observation,
            {
              componentSetStableId:
                observation.source.componentSetStableId ?? null,
            },
            { registeredComponentSourceRequired: true },
            "Replace this Instance with one from the active Component Registry.",
          ),
        );
      } else {
        const variant = source.variants.find(
          ({ stableId }) => stableId === observation.source?.componentStableId,
        );
        if (variant === undefined) {
          nodeFindings.push(
            finding(
              "UNREGISTERED_VARIANT",
              observation,
              { componentStableId: observation.source.componentStableId },
              {
                registeredVariantStableIds: source.variants.map(
                  ({ stableId }) => stableId,
                ),
              },
              "Select an approved Variant from the registered Component Set.",
            ),
          );
        } else if (
          Object.entries(variant.properties).some(
            ([name, value]) =>
              observation.source?.variantProperties[name] !== value,
          )
        ) {
          nodeFindings.push(
            finding(
              "VARIANT_PROPERTY_MISMATCH",
              observation,
              { variantProperties: observation.source.variantProperties },
              { variantProperties: variant.properties },
              "Restore the exact approved Variant property selections.",
            ),
          );
        }
      }
    }
    if (
      observation.managedInstance !== null &&
      (observation.managedInstance.phase !== "applied" ||
        observation.source === null ||
        observation.managedInstance.componentSetStableId !==
          observation.source.componentSetStableId ||
        observation.managedInstance.variantStableId !==
          observation.source.componentStableId)
    ) {
      nodeFindings.push(
        finding(
          "INSTANCE_PROVENANCE_MISMATCH",
          observation,
          { managedInstance: observation.managedInstance },
          {
            componentSetStableId:
              observation.source?.componentSetStableId ?? null,
            phase: "applied",
            variantStableId: observation.source?.componentStableId ?? null,
          },
          "Reinsert the Instance through the Registry-backed Agent workflow.",
        ),
      );
    }
    if (nodeFindings.length === 0) compliantInstances += 1;
    findings.push(...nodeFindings);
  }
  if (findings.length > 10_000) {
    throw new ComponentAuditError({
      code: "VALIDATION_FAILED",
      message: "The current page exceeds the 10,000-finding report limit.",
      recoveryInstruction:
        "Split the page into smaller auditable scopes before retrying.",
    });
  }
  findings.sort((left, right) =>
    `${left.node.id}/${left.code}`.localeCompare(
      `${right.node.id}/${right.code}`,
    ),
  );
  const count = (code: FigmaComponentAuditFinding["code"]) =>
    findings.filter((candidate) => candidate.code === code).length;
  return {
    findings,
    page: port.getCurrentPage(),
    passed: findings.length === 0,
    schemaVersion: "1.0.0",
    scope: "current-page",
    summary: {
      auditedNodes: observations.length,
      compliantInstances,
      detachedOrApproximate: count("DETACHED_OR_APPROXIMATE_COMPONENT"),
      provenanceMismatches: count("INSTANCE_PROVENANCE_MISMATCH"),
      unregisteredSources: count("UNREGISTERED_COMPONENT_SOURCE"),
      unregisteredVariants: count("UNREGISTERED_VARIANT"),
      variantPropertyMismatches: count("VARIANT_PROPERTY_MISMATCH"),
    },
    type: "audit.components.scan",
  };
}
