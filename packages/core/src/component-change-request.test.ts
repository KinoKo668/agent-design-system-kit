import { describe, expect, it } from "vitest";

import validButtonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import invalidChangeRequest from "../../../design-system/examples/change-requests/invalid-component.change-request.json" with { type: "json" };
import validChangeRequest from "../../../design-system/examples/change-requests/tertiary-button.change-request.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS,
  resolveComponentOrRequestChange,
  toComponentChangeRequestDigestSubject,
  validateComponentChangeRequest,
} from "./component-change-request.js";
import {
  validateDesignSystemSnapshot,
  type DesignSystemSnapshot,
} from "./design-system-snapshot.js";
import { isFailureResult, isSuccessResult } from "./results.js";

const CONTRACT_DIGEST = validButtonContract.contentDigest;
const SUBMISSION = {
  intendedUse:
    "Use the requested component in a product page without introducing one-off visual rules.",
  rationale:
    "The exact request cannot be represented by the current approved component catalog.",
  requestId: "00000000-0000-4000-8000-000000000010",
  submittedAt: "2026-09-01T15:45:00Z",
  submittedBy: { id: "codex", type: "agent" },
  summary: "Review a missing component capability",
} as const;

function createSnapshot(): DesignSystemSnapshot {
  const result = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "token-set",
      sourcePath: "tokens/foundation.tokens.json",
      value: validTokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: { ...validButtonContract, contentDigest: CONTRACT_DIGEST },
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: validRegistry,
    },
  ]);
  if (!isSuccessResult(result)) {
    throw new Error("Expected a valid design-system snapshot.");
  }
  return result.data;
}

describe("validateComponentChangeRequest", () => {
  it("accepts the public Tertiary Button Change Request fixture", () => {
    const result = validateComponentChangeRequest(validChangeRequest);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the valid Change Request fixture.");
    }
    expect(result.data).toMatchObject({
      changeKind: "extend-component",
      nextAction: "human-triage",
      prohibitedActions: COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS,
      requestType: "component-change-request",
      status: "proposed",
    });
  });

  it("returns stable paths for inconsistent construction", () => {
    const result = validateComponentChangeRequest(invalidChangeRequest);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Change Request fixture to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/sourceQuery/projectId" }),
        expect.objectContaining({ path: "/target/assetId" }),
        expect.objectContaining({ path: "/existingCandidates/0/asset/id" }),
        expect.objectContaining({ path: "/resolutionEvidence/issues" }),
        expect.objectContaining({ path: "/changeKind" }),
      ]),
    );
  });

  it("rejects hidden writer intent as an unknown field", () => {
    const result = validateComponentChangeRequest({
      ...validChangeRequest,
      writerCommand: { type: "create-component" },
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected hidden writer intent to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/writerCommand" }),
      ]),
    );
  });

  it("rejects duplicate candidates and evidence that contradicts Change Kind", () => {
    const candidate = validChangeRequest.existingCandidates[0];
    if (candidate === undefined) {
      throw new Error("Expected an existing candidate fixture.");
    }
    const result = validateComponentChangeRequest({
      ...validChangeRequest,
      existingCandidates: [candidate, candidate],
      resolutionEvidence: {
        errorCode: "IDENTITY_NOT_FOUND",
        issues: [],
      },
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error(
        "Expected contradictory Change Request evidence to fail.",
      );
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/existingCandidates/1/asset/version",
        }),
        expect.objectContaining({
          path: "/resolutionEvidence/errorCode",
        }),
      ]),
    );
  });

  it("uses an explicit digest projection that excludes only contentDigest", () => {
    const result = validateComponentChangeRequest({
      ...validChangeRequest,
      contentDigest: `sha256:${"a".repeat(64)}`,
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected a digest-bearing Change Request.");
    }
    const subject = toComponentChangeRequestDigestSubject(result.data);
    expect(subject).not.toHaveProperty("contentDigest");
    expect(subject.submission).not.toHaveProperty("submittedAt");
    expect(subject).toMatchObject({
      requestId: validChangeRequest.requestId,
      sourceQuery: validChangeRequest.sourceQuery,
      target: validChangeRequest.target,
    });
  });
});

describe("resolveComponentOrRequestChange", () => {
  it("preserves a successful exact resolution instead of creating a request", () => {
    const result = resolveComponentOrRequestChange(
      createSnapshot(),
      { assetId: "button", projectId: "hatch-demo" },
      SUBMISSION,
    );

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected exact Button resolution to succeed.");
    }
    expect(result.data).toMatchObject({
      outcome: "resolved",
      resolution: { status: "figma-ready" },
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "APPROVAL_GUARD_REQUIRED" }),
        expect.objectContaining({ code: "FIGMA_AUDIT_REQUIRED" }),
      ]),
    );
  });

  it("creates a human-triage request when no component identity exists", () => {
    const result = resolveComponentOrRequestChange(
      createSnapshot(),
      { assetId: "select", projectId: "hatch-demo" },
      SUBMISSION,
    );

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected a missing-component Change Request.");
    }
    expect(result.data).toMatchObject({
      changeRequest: {
        changeKind: "create-component",
        existingCandidates: [],
        nextAction: "human-triage",
        prohibitedActions: COMPONENT_CHANGE_REQUEST_PROHIBITED_ACTIONS,
        resolutionEvidence: {
          errorCode: "IDENTITY_NOT_FOUND",
          issues: [],
        },
        sourceQuery: {
          assetId: "select",
          projectId: "hatch-demo",
          variantSelections: {},
        },
        status: "proposed",
        target: { assetId: "select", assetType: "component" },
      },
      outcome: "change-request-required",
    });
    if (result.data.outcome !== "change-request-required") {
      throw new Error("Expected the Change Request outcome.");
    }
    expect(result.data.changeRequest).not.toHaveProperty("writerCommand");
    expect(result.data.changeRequest).not.toHaveProperty("componentContract");
    expect(result.data.changeRequest).not.toHaveProperty("registryEntry");
    expect(result.data.changeRequest).not.toHaveProperty("figmaLocator");
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "COMPONENT_CHANGE_REQUEST_REQUIRED" }),
    ]);
  });

  it("turns an unregistered Tertiary Variant into an extension request", () => {
    const result = resolveComponentOrRequestChange(
      createSnapshot(),
      {
        assetId: "button",
        projectId: "hatch-demo",
        variantSelections: { appearance: "tertiary", state: "default" },
      },
      SUBMISSION,
    );

    expect(isSuccessResult(result)).toBe(true);
    if (
      !isSuccessResult(result) ||
      result.data.outcome !== "change-request-required"
    ) {
      throw new Error("Expected a Variant extension Change Request.");
    }
    expect(result.data.changeRequest).toMatchObject({
      changeKind: "extend-component",
      existingCandidates: [
        {
          asset: { id: "button", version: "1.0.0" },
          lifecycle: "active",
          sources: {
            contractSourcePath: "components/button.component.json",
            registrySourcePath: "registry/components.registry.json",
          },
        },
      ],
      resolutionEvidence: {
        errorCode: "VALIDATION_FAILED",
        issues: [
          {
            code: "unsupported_variant_option",
            path: "/variantSelections/appearance",
          },
        ],
      },
    });
  });

  it("requests availability review instead of recreating another version", () => {
    const result = resolveComponentOrRequestChange(
      createSnapshot(),
      {
        assetId: "button",
        assetVersion: "2.0.0",
        projectId: "hatch-demo",
      },
      SUBMISSION,
    );

    expect(isSuccessResult(result)).toBe(true);
    if (
      !isSuccessResult(result) ||
      result.data.outcome !== "change-request-required"
    ) {
      throw new Error("Expected an availability-review Change Request.");
    }
    expect(result.data.changeRequest).toMatchObject({
      changeKind: "review-component-availability",
      existingCandidates: [{ asset: { id: "button", version: "1.0.0" } }],
      target: { requestedVersion: "2.0.0" },
    });
  });

  it("is deterministic for the same validated inputs", () => {
    const snapshot = createSnapshot();
    const query = { assetId: "select", projectId: "hatch-demo" };

    const first = resolveComponentOrRequestChange(snapshot, query, SUBMISSION);
    const second = resolveComponentOrRequestChange(snapshot, query, SUBMISSION);

    expect(first).toEqual(second);
  });

  it("does not create requests for malformed inputs or another project", () => {
    const snapshot = createSnapshot();
    const malformed = resolveComponentOrRequestChange(
      snapshot,
      { assetId: "Button", projectId: "hatch-demo" },
      SUBMISSION,
    );
    const invalidSubmission = resolveComponentOrRequestChange(
      snapshot,
      { assetId: "select", projectId: "hatch-demo" },
      { ...SUBMISSION, requestId: "not-a-uuid" },
    );
    const wrongProject = resolveComponentOrRequestChange(
      snapshot,
      { assetId: "select", projectId: "another-project" },
      SUBMISSION,
    );

    for (const result of [malformed, invalidSubmission, wrongProject]) {
      expect(isFailureResult(result)).toBe(true);
    }
    if (!isFailureResult(invalidSubmission)) {
      throw new Error("Expected invalid submission metadata to fail.");
    }
    expect(invalidSubmission.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/submission/requestId" }),
      ]),
    );
    if (!isFailureResult(wrongProject)) {
      throw new Error("Expected another project to fail.");
    }
    expect(wrongProject.error.code).toBe("IDENTITY_NOT_FOUND");
  });

  it("propagates identity conflicts instead of opening a misleading request", () => {
    const snapshot = createSnapshot();
    const registry = snapshot.registries[0];
    if (registry === undefined) {
      throw new Error("Expected a Registry in the valid snapshot.");
    }
    const conflictingSnapshot: DesignSystemSnapshot = {
      ...snapshot,
      registries: [
        registry,
        {
          data: registry.data,
          sourcePath: "registry/conflicting.registry.json",
        },
      ],
    };

    const result = resolveComponentOrRequestChange(
      conflictingSnapshot,
      { assetId: "button", projectId: "hatch-demo" },
      SUBMISSION,
    );

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected Registry ambiguity to fail.");
    }
    expect(result.error.code).toBe("IDENTITY_CONFLICT");
  });
});
