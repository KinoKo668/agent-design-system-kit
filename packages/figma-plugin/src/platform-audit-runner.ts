import type {
  ErrorCode,
  FigmaPlatformAuditPlan,
  FigmaPlatformAuditFinding,
  FigmaPlatformAuditResult,
  FigmaPlatformObservation,
} from "@agent-design-system-kit/core";

import {
  getFigmaLibraryFileBinding,
  type SharedPluginDataPort,
} from "./variables-writer.js";

export interface FigmaPlatformAuditPort {
  readonly document: SharedPluginDataPort;
  getCurrentPage(): { readonly id: string; readonly name: string };
  getObservations(): Promise<readonly FigmaPlatformObservation[]>;
}

export class PlatformAuditError extends Error {
  readonly code: ErrorCode;
  readonly recoveryInstruction: string;
  constructor(input: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly recoveryInstruction: string;
  }) {
    super(input.message);
    this.name = "PlatformAuditError";
    this.code = input.code;
    this.recoveryInstruction = input.recoveryInstruction;
  }
}

export async function runFigmaPlatformAudit(
  port: FigmaPlatformAuditPort,
  plan: FigmaPlatformAuditPlan,
): Promise<FigmaPlatformAuditResult> {
  const binding = getFigmaLibraryFileBinding(port.document);
  if (
    binding === null ||
    binding.fileRole !== "design-page" ||
    binding.projectId !== plan.projectId ||
    binding.fileBindingId !== plan.fileBindingId
  ) {
    throw new PlatformAuditError({
      code: "FILE_BINDING_MISMATCH",
      message: "The open Figma file does not match the Platform audit plan.",
      recoveryInstruction:
        "Open the exact bound page file before running the read-only audit.",
    });
  }
  const observations = await port.getObservations();
  if (observations.length > 10_000) {
    throw new PlatformAuditError({
      code: "VALIDATION_FAILED",
      message: "The page exceeds the 10,000-node Platform audit limit.",
      recoveryInstruction:
        "Split the page into smaller auditable scopes before retrying.",
    });
  }
  const sources = new Map(
    plan.sources.map((source) => [
      `${source.bindingId}@${source.bindingVersion}`,
      source,
    ]),
  );
  const findings: FigmaPlatformAuditFinding[] = [];
  let compliantInstances = 0;
  const add = (
    code: FigmaPlatformAuditFinding["code"],
    observation: FigmaPlatformObservation,
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
    recoveryInstruction: string,
  ) => {
    findings.push({
      actual: actual as FigmaPlatformAuditFinding["actual"],
      code,
      expected: expected as FigmaPlatformAuditFinding["expected"],
      node: observation.node,
      recoveryInstruction,
      severity: "error",
    });
  };
  for (const observation of observations) {
    const before = findings.length;
    if (observation.marker.status === "invalid") {
      add(
        "PLATFORM_PROVENANCE_MISMATCH",
        observation,
        { marker: "invalid" },
        { validAppliedMarker: true },
        "Reinsert the component through the approved official Platform workflow.",
      );
      continue;
    }
    const marker = observation.marker;
    const source = sources.get(`${marker.bindingId}@${marker.bindingVersion}`);
    if (source === undefined) {
      add(
        "PLATFORM_BINDING_UNREGISTERED",
        observation,
        { bindingId: marker.bindingId, bindingVersion: marker.bindingVersion },
        { activeReadyBindingRequired: true },
        "Replace this Instance with one from an active approved Platform Binding.",
      );
      continue;
    }
    if (
      marker.projectId !== plan.projectId ||
      marker.phase !== "applied" ||
      marker.contentDigest !== source.contentDigest ||
      marker.libraryId !== source.libraryId
    ) {
      add(
        "PLATFORM_PROVENANCE_MISMATCH",
        observation,
        { marker },
        {
          contentDigest: source.contentDigest,
          libraryId: source.libraryId,
          phase: "applied",
          projectId: plan.projectId,
        },
        "Reinsert the exact approved binding; do not edit its provenance marker.",
      );
    }
    if (
      marker.platformTargetId !== source.platformTargetId ||
      marker.platformTargetVersion !== source.platformTargetVersion ||
      (source.vendor === "apple" && source.platform === "android") ||
      (source.vendor === "google" && source.platform !== "android")
    ) {
      add(
        "PLATFORM_TARGET_MISMATCH",
        observation,
        {
          platformTargetId: marker.platformTargetId,
          platformTargetVersion: marker.platformTargetVersion,
        },
        {
          platform: source.platform,
          platformTargetId: source.platformTargetId,
          platformTargetVersion: source.platformTargetVersion,
          releaseChannel: source.releaseChannel,
          vendor: source.vendor,
        },
        "Use the approved component mapping for the page's exact Platform Target.",
      );
    }
    if (observation.source === null) {
      add(
        "OFFICIAL_INSTANCE_DETACHED",
        observation,
        { nodeType: observation.node.type },
        { nodeType: "INSTANCE", remote: true },
        "Remove the detached node and reinsert the official remote Instance.",
      );
    } else if (
      !observation.source.remote ||
      observation.source.componentKey !== marker.componentKey ||
      !source.componentKeys.includes(observation.source.componentKey)
    ) {
      add(
        "OFFICIAL_SOURCE_KEY_MISMATCH",
        observation,
        { source: observation.source },
        { approvedComponentKeys: source.componentKeys, remote: true },
        "Replace the node with the exact registered official Component Key.",
      );
    }
    if (findings.length === before) compliantInstances += 1;
  }
  findings.sort((left, right) =>
    `${left.node.id}/${left.code}`.localeCompare(
      `${right.node.id}/${right.code}`,
    ),
  );
  const count = (code: FigmaPlatformAuditFinding["code"]) =>
    findings.filter((finding) => finding.code === code).length;
  return {
    findings,
    page: port.getCurrentPage(),
    passed: findings.length === 0,
    schemaVersion: "1.0.0",
    scope: "current-page",
    summary: {
      auditedInstances: observations.length,
      compliantInstances,
      detached: count("OFFICIAL_INSTANCE_DETACHED"),
      provenanceMismatches: count("PLATFORM_PROVENANCE_MISMATCH"),
      sourceKeyMismatches: count("OFFICIAL_SOURCE_KEY_MISMATCH"),
      targetMismatches: count("PLATFORM_TARGET_MISMATCH"),
      unregisteredBindings: count("PLATFORM_BINDING_UNREGISTERED"),
    },
    type: "audit.platform-components.scan",
  };
}
