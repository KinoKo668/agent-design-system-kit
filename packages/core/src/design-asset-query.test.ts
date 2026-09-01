import { describe, expect, it } from "vitest";

import validBrief from "../../../design-system/hatch-demo/briefs/hatch-demo.brief.json" with { type: "json" };
import validButtonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validDirectionReview from "../../../design-system/hatch-demo/directions/hatch-demo.direction-review.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  queryDesignBriefs,
  queryDirectionReviews,
  queryTokenSets,
} from "./design-asset-query.js";
import {
  validateDesignSystemSnapshot,
  type DesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";
import { isFailureResult, isSuccessResult } from "./results.js";

function createSnapshot(
  additions: readonly DesignSystemSourceDocument[] = [],
): DesignSystemSnapshot {
  const result = validateDesignSystemSnapshot("hatch-demo", [
    {
      kind: "brief",
      sourcePath: "briefs/product.brief.json",
      value: validBrief,
    },
    {
      kind: "direction",
      sourcePath: "directions/foundation.direction-review.json",
      value: validDirectionReview,
    },
    {
      kind: "token-set",
      sourcePath: "tokens/foundation.tokens.json",
      value: validTokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/button.component.json",
      value: validButtonContract,
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: validRegistry,
    },
    ...additions,
  ]);
  if (!isSuccessResult(result)) {
    throw new Error("Expected a valid design-system snapshot.");
  }
  return result.data;
}

describe("queryDesignBriefs", () => {
  it("returns deterministic summaries with source paths and no full payload", () => {
    const result = queryDesignBriefs(createSnapshot(), {
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the Brief query to succeed.");
    }
    expect(result.data).toMatchObject({
      items: [
        {
          asset: {
            contentDigest: null,
            id: "product-foundation",
            type: "brief",
            version: "1.0.0",
          },
          brief: null,
          sourcePath: "briefs/product.brief.json",
          title: "Hatch design-system toolkit demo",
        },
      ],
      page: { limit: 50, nextOffset: null, offset: 0, returned: 1, total: 1 },
      query: { detail: "summary", projectId: "hatch-demo" },
    });
  });

  it("returns one full Brief only for an exact identity and version", () => {
    const result = queryDesignBriefs(createSnapshot(), {
      assetId: "product-foundation",
      assetVersion: "1.0.0",
      detail: "full",
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the full Brief query to succeed.");
    }
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.brief).toMatchObject({
      assetId: "product-foundation",
      product: {
        summary:
          "A local-first toolkit that helps AI agents build and reuse an approved design system.",
      },
    });
  });

  it("sorts versions newest-first and paginates summaries without truncation", () => {
    const snapshot = createSnapshot([
      {
        kind: "brief",
        sourcePath: "briefs/product-1.1.0.brief.json",
        value: { ...validBrief, assetVersion: "1.1.0" },
      },
    ]);
    const first = queryDesignBriefs(snapshot, {
      limit: 1,
      projectId: "hatch-demo",
    });
    const second = queryDesignBriefs(snapshot, {
      limit: 1,
      offset: 1,
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(first)).toBe(true);
    expect(isSuccessResult(second)).toBe(true);
    if (!isSuccessResult(first) || !isSuccessResult(second)) {
      throw new Error("Expected paginated Brief queries to succeed.");
    }
    expect(first.data.items[0]?.asset.version).toBe("1.1.0");
    expect(first.data.page).toMatchObject({ nextOffset: 1, total: 2 });
    expect(second.data.items[0]?.asset.version).toBe("1.0.0");
    expect(second.data.page.nextOffset).toBeNull();
  });

  it("fails explicitly for malformed or missing exact full queries", () => {
    const malformed = queryDesignBriefs(createSnapshot(), {
      detail: "full",
      projectId: "hatch-demo",
    });
    const missing = queryDesignBriefs(createSnapshot(), {
      assetId: "missing-brief",
      assetVersion: "1.0.0",
      detail: "full",
      projectId: "hatch-demo",
    });

    expect(isFailureResult(malformed)).toBe(true);
    expect(isFailureResult(missing)).toBe(true);
    if (isFailureResult(malformed) && isFailureResult(missing)) {
      expect(malformed.error.code).toBe("VALIDATION_FAILED");
      expect(missing.error.code).toBe("IDENTITY_NOT_FOUND");
    }
  });
});

describe("queryDirectionReviews", () => {
  it("returns comparable summaries without the full review payload", () => {
    const result = queryDirectionReviews(createSnapshot(), {
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the Direction Review query to succeed.");
    }
    expect(result.data).toMatchObject({
      items: [
        {
          asset: {
            contentDigest:
              "sha256:141bc7ac01494b2730d1b066d6d222c529cea67ef1a4aa20f55589fe69235211",
            id: "product-foundation-directions",
            type: "direction",
            version: "1.0.0",
          },
          directionReview: null,
          selectedCandidateId: null,
          sourcePath: "directions/foundation.direction-review.json",
          status: "in_review",
          title: "Hatch product foundation direction review",
        },
      ],
      page: { returned: 1, total: 1 },
      query: { detail: "summary", status: "any" },
    });
    expect(result.data.items[0]?.candidates).toEqual([
      expect.objectContaining({ id: "precision-grid", density: "compact" }),
      expect.objectContaining({ id: "warm-studio", density: "relaxed" }),
      expect.objectContaining({ id: "signal-layer", density: "balanced" }),
    ]);
  });

  it("returns the full candidate evidence only for an exact identity", () => {
    const result = queryDirectionReviews(createSnapshot(), {
      assetId: "product-foundation-directions",
      assetVersion: "1.0.0",
      detail: "full",
      projectId: "hatch-demo",
      status: "in_review",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the full Direction Review query to succeed.");
    }
    expect(result.data.items[0]?.directionReview?.candidates).toHaveLength(3);
    expect(
      result.data.items[0]?.directionReview?.candidates[0]?.benefits,
    ).toHaveLength(2);
  });

  it("rejects broad full queries and missing exact identities", () => {
    const broad = queryDirectionReviews(createSnapshot(), {
      detail: "full",
      projectId: "hatch-demo",
    });
    const missing = queryDirectionReviews(createSnapshot(), {
      assetId: "missing-direction",
      assetVersion: "1.0.0",
      detail: "full",
      projectId: "hatch-demo",
    });

    expect(isFailureResult(broad)).toBe(true);
    expect(isFailureResult(missing)).toBe(true);
    if (isFailureResult(broad) && isFailureResult(missing)) {
      expect(broad.error.code).toBe("VALIDATION_FAILED");
      expect(missing.error.code).toBe("IDENTITY_NOT_FOUND");
    }
  });
});

describe("queryTokenSets", () => {
  it("returns bounded Token Set summaries with modes and relative sources", () => {
    const result = queryTokenSets(createSnapshot(), {
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the Token Set query to succeed.");
    }
    expect(result.data.items).toEqual([
      expect.objectContaining({
        asset: {
          contentDigest: null,
          id: "button-foundation",
          type: "token-set",
          version: "1.0.0",
        },
        definitions: [],
        modeId: null,
        modes: [{ id: "light", name: "Light", tokenCount: 31 }],
        sourcePath: "tokens/foundation.tokens.json",
        unmatchedPaths: [],
      }),
    ]);
  });

  it("returns exact requested Tokens and their alias dependencies", () => {
    const result = queryTokenSets(createSnapshot(), {
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      detail: "definitions",
      modeId: "light",
      paths: ["semantic.color.action-primary-background"],
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected Token definitions to resolve.");
    }
    expect(
      result.data.items[0]?.definitions.map(({ path, requested }) => ({
        path,
        requested,
      })),
    ).toEqual([
      { path: "primitive.color.brand-600", requested: false },
      {
        path: "semantic.color.action-primary-background",
        requested: true,
      },
    ]);
  });

  it("can omit dependencies and reports unmatched exact paths", () => {
    const result = queryTokenSets(createSnapshot(), {
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      detail: "definitions",
      includeDependencies: false,
      modeId: "light",
      paths: [
        "semantic.color.action-primary-background",
        "semantic.color.missing",
      ],
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected a partial exact Token query to succeed.");
    }
    expect(result.data.items[0]?.definitions).toHaveLength(1);
    expect(result.data.items[0]?.unmatchedPaths).toEqual([
      "semantic.color.missing",
    ]);
  });

  it("rejects ambiguous definition requests and unknown modes", () => {
    const malformed = queryTokenSets(createSnapshot(), {
      detail: "definitions",
      paths: ["semantic.color.action-primary-background"],
      projectId: "hatch-demo",
    });
    const missingMode = queryTokenSets(createSnapshot(), {
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      detail: "definitions",
      modeId: "dark",
      paths: ["semantic.color.action-primary-background"],
      projectId: "hatch-demo",
    });

    expect(isFailureResult(malformed)).toBe(true);
    expect(isFailureResult(missingMode)).toBe(true);
    if (isFailureResult(malformed) && isFailureResult(missingMode)) {
      expect(malformed.error.code).toBe("VALIDATION_FAILED");
      expect(missingMode.error.code).toBe("IDENTITY_NOT_FOUND");
    }
  });

  it("rejects duplicate paths instead of returning duplicated definitions", () => {
    const path = "semantic.color.action-primary-background";
    const result = queryTokenSets(createSnapshot(), {
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      detail: "definitions",
      modeId: "light",
      paths: [path, path],
      projectId: "hatch-demo",
    });

    expect(isFailureResult(result)).toBe(true);
    if (isFailureResult(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.context?.details?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "/paths" })]),
      );
    }
  });

  it("fails instead of silently truncating an oversized dependency closure", () => {
    const semanticTokens = Array.from({ length: 256 }, (_, index) => ({
      $description: `Dependency chain Token ${String(index)}.`,
      $type: "color" as const,
      $value:
        index === 255
          ? "{primitive.color.chain-base}"
          : `{semantic.color.chain-${String(index + 1)}}`,
      path: ["semantic", "color", `chain-${String(index)}`],
    }));
    const largeTokenSet = {
      ...validTokenSet,
      assetId: "large-token-set",
      modes: [
        {
          id: "light",
          name: "Light",
          tokens: [
            ...semanticTokens,
            {
              $description: "Dependency chain primitive.",
              $type: "color" as const,
              $value: {
                alpha: 1,
                colorSpace: "srgb" as const,
                components: [0, 0, 0] as [number, number, number],
                hex: "#000000",
              },
              path: ["primitive", "color", "chain-base"],
            },
          ],
        },
      ],
      name: "Large Token Set",
    };
    const snapshot = createSnapshot([
      {
        kind: "token-set",
        sourcePath: "tokens/large.tokens.json",
        value: largeTokenSet,
      },
    ]);
    const result = queryTokenSets(snapshot, {
      assetId: "large-token-set",
      assetVersion: "1.0.0",
      detail: "definitions",
      modeId: "light",
      paths: ["semantic.color.chain-0"],
      projectId: "hatch-demo",
    });

    expect(isFailureResult(result)).toBe(true);
    if (isFailureResult(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("exceeds the output limit");
    }
  });
});
