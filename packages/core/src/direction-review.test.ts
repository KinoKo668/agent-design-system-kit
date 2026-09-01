import { describe, expect, it } from "vitest";

import publicReview from "../../../design-system/hatch-demo/directions/hatch-demo.direction-review.json" with { type: "json" };

import {
  DIRECTION_REVIEW_ASSET_TYPE,
  DIRECTION_REVIEW_SCHEMA_VERSION,
  createDirectionReviewDraft,
  deriveDirectionReviewSelection,
  toDirectionReviewDigestSubject,
  validateDirectionReview,
} from "./direction-review.js";
import { isFailureResult, isSuccessResult } from "./results.js";

describe("validateDirectionReview", () => {
  it("accepts the public three-candidate review without inventing approval", () => {
    const result = validateDirectionReview(publicReview);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the public Direction Review to pass.");
    }

    expect(result.data).toMatchObject({
      assetType: DIRECTION_REVIEW_ASSET_TYPE,
      schemaVersion: DIRECTION_REVIEW_SCHEMA_VERSION,
      selection: {
        decisions: [],
        selectedCandidateId: null,
        status: "in_review",
      },
    });
    expect(result.data.candidates).toHaveLength(3);
    expect(
      new Set(result.data.candidates.map(({ preview }) => preview.scenarioId)),
    ).toEqual(new Set(["ui-foundation-card"]));
  });

  it("derives selection only when both human roles choose the same candidate", () => {
    const selectedReview = {
      ...publicReview,
      selection: {
        ...publicReview.selection,
        decisions: [
          {
            candidateId: "signal-layer",
            decidedAt: "2026-09-01T13:00:00-04:00",
            decision: "selected",
            reviewer: "human:product-lead",
            role: "product_owner",
            summary: "This direction best explains the product boundary.",
          },
          {
            candidateId: "signal-layer",
            decidedAt: "2026-09-01T13:05:00-04:00",
            decision: "selected",
            reviewer: "github:design-lead",
            role: "design_owner",
            summary: "The visual system is distinctive and governable.",
          },
        ],
        selectedCandidateId: "signal-layer",
        status: "selected",
      },
    };

    const result = validateDirectionReview(selectedReview);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected matching human selections to pass.");
    }
    expect(deriveDirectionReviewSelection(result.data)).toEqual({
      selectedCandidateId: "signal-layer",
      status: "selected",
    });
  });

  it("rejects Agent reviewers, mismatched scenarios and a forged status", () => {
    const invalidReview = {
      ...publicReview,
      candidates: publicReview.candidates.map((candidate, index) =>
        index === 1
          ? {
              ...candidate,
              preview: {
                ...candidate.preview,
                scenarioId: "different-scenario",
              },
            }
          : candidate,
      ),
      selection: {
        ...publicReview.selection,
        decisions: [
          {
            candidateId: "precision-grid",
            decidedAt: "2026-09-01T13:00:00-04:00",
            decision: "selected",
            reviewer: "agent:direction-author",
            role: "product_owner",
            summary: "An Agent must not impersonate the human decision maker.",
          },
        ],
        selectedCandidateId: "precision-grid",
        status: "selected",
      },
    };

    const result = validateDirectionReview(invalidReview);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Direction Review to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/comparisonScenario" }),
        expect.objectContaining({
          path: "/selection/decisions/0/reviewer",
        }),
        expect.objectContaining({ path: "/selection/status" }),
        expect.objectContaining({
          path: "/selection/selectedCandidateId",
        }),
      ]),
    );
  });

  it("rejects anything other than exactly three candidates", () => {
    const invalidReview = structuredClone(publicReview);
    invalidReview.candidates.pop();

    const result = validateDirectionReview(invalidReview);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected a two-candidate review to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/candidates" }),
      ]),
    );
  });

  it("rejects unsupported schema versions before normal validation", () => {
    const result = validateDirectionReview({
      ...publicReview,
      schemaVersion: "2.0.0",
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected an unsupported schema version to fail.");
    }
    expect(result.error).toMatchObject({
      code: "SCHEMA_VERSION_UNSUPPORTED",
      context: {
        actual: { schemaVersion: "2.0.0" },
        expected: { schemaVersion: "1.0.0" },
      },
    });
  });
});

describe("createDirectionReviewDraft", () => {
  it("creates an honest draft with no decisions", () => {
    const parsed = validateDirectionReview(publicReview);
    expect(isSuccessResult(parsed)).toBe(true);
    if (!isSuccessResult(parsed)) {
      throw new Error("Expected the public Direction Review to pass.");
    }

    const result = createDirectionReviewDraft({
      assetId: parsed.data.assetId,
      assetVersion: parsed.data.assetVersion,
      briefSource: parsed.data.briefSource,
      candidates: parsed.data.candidates,
      comparisonScenario: parsed.data.comparisonScenario,
      projectId: parsed.data.projectId,
      submittedBy: "agent:direction-author",
      summary: parsed.data.summary,
      title: parsed.data.title,
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected Direction Review draft creation to pass.");
    }
    expect(result.data.selection).toEqual({
      decisions: [],
      selectedCandidateId: null,
      status: "draft",
      submission: {
        submittedAt: null,
        submittedBy: "agent:direction-author",
      },
    });
  });
});

describe("toDirectionReviewDigestSubject", () => {
  it("excludes only the stored content digest", () => {
    const result = validateDirectionReview({
      ...publicReview,
      contentDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the digest fixture to pass.");
    }

    const subject = toDirectionReviewDigestSubject(result.data);

    expect(subject).not.toHaveProperty("contentDigest");
    expect(subject).toMatchObject({
      assetId: "product-foundation-directions",
      assetVersion: "1.0.0",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    });
    expect(JSON.parse(JSON.stringify(subject))).toEqual(subject);
  });
});
