import type {
  ErrorCode,
  FigmaStyleAuditFinding,
  FigmaStyleAuditPlan,
  FigmaStyleAuditResult,
  FigmaStyleObservation,
} from "@agent-design-system-kit/core";

import {
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export interface FigmaStyleAuditPort {
  readonly document: SharedPluginDataPort;
  getCurrentPage(): { readonly id: string; readonly name: string };
  getStyleObservations(): Promise<readonly FigmaStyleObservation[]>;
}

export class StyleAuditError extends Error {
  readonly code: ErrorCode;
  readonly recoveryInstruction: string;

  constructor(input: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly recoveryInstruction: string;
  }) {
    super(input.message);
    this.name = "StyleAuditError";
    this.code = input.code;
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

export async function runFigmaStyleAudit(
  port: FigmaStyleAuditPort,
  plan: FigmaStyleAuditPlan,
): Promise<FigmaStyleAuditResult> {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.projectId !== plan.projectId ||
    binding.fileBindingId !== plan.fileBindingId
  ) {
    throw new StyleAuditError({
      code: "FILE_BINDING_MISMATCH",
      message: "The open Figma file does not match the style audit plan.",
      recoveryInstruction:
        "Open the exact registered Figma file and retry the read-only audit.",
    });
  }
  const observations = await port.getStyleObservations();
  if (observations.length > 50_000) {
    throw new StyleAuditError({
      code: "VALIDATION_FAILED",
      message: "The current page exceeds the 50,000-style audit limit.",
      recoveryInstruction:
        "Split the page into smaller auditable scopes before retrying.",
    });
  }
  const registered = new Set(
    plan.registeredVariables.map(({ stableId }) => stableId),
  );
  const findings: FigmaStyleAuditFinding[] = [];
  let registeredBindings = 0;
  for (const observation of observations) {
    if (observation.binding === null) {
      findings.push({
        actual: { bindingVariableId: null, value: observation.actual },
        code: "HARD_CODED_STYLE",
        expected: { registeredVariableRequired: true },
        field: observation.field,
        kind: observation.kind,
        node: observation.node,
        recoveryInstruction:
          "Replace the direct value with an approved registered Variable binding.",
        severity: "error",
      });
    } else if (
      observation.binding.stableId === null ||
      !registered.has(observation.binding.stableId)
    ) {
      findings.push({
        actual: {
          bindingVariableId: observation.binding.id,
          value: observation.actual,
        },
        code: "UNREGISTERED_VARIABLE",
        expected: { registeredVariableRequired: true },
        field: observation.field,
        kind: observation.kind,
        node: observation.node,
        recoveryInstruction:
          "Bind this field to a Variable registered by the current Git Token Set.",
        severity: "error",
      });
    } else {
      registeredBindings += 1;
    }
  }
  if (findings.length > 10_000) {
    throw new StyleAuditError({
      code: "VALIDATION_FAILED",
      message: "The current page exceeds the 10,000-finding report limit.",
      recoveryInstruction:
        "Split the page into smaller auditable scopes before retrying.",
    });
  }
  findings.sort((left, right) =>
    `${left.node.id}/${left.field}/${left.code}`.localeCompare(
      `${right.node.id}/${right.field}/${right.code}`,
    ),
  );
  return {
    findings,
    page: port.getCurrentPage(),
    passed: findings.length === 0,
    schemaVersion: "1.0.0",
    scope: "current-page",
    summary: {
      auditedStyles: observations.length,
      hardCodedStyles: findings.filter(
        ({ code }) => code === "HARD_CODED_STYLE",
      ).length,
      nodesWithFindings: new Set(findings.map(({ node }) => node.id)).size,
      registeredBindings,
      unregisteredVariables: findings.filter(
        ({ code }) => code === "UNREGISTERED_VARIABLE",
      ).length,
    },
    type: "audit.styles.scan",
  };
}
