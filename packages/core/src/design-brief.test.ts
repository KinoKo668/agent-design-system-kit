import { describe, expect, it } from "vitest";

import invalidCrossReferences from "../../../design-system/examples/briefs/invalid-cross-references.brief.json" with { type: "json" };
import validBrief from "../../../design-system/examples/briefs/hatch-demo.brief.json" with { type: "json" };

import {
  DESIGN_BRIEF_ASSET_TYPE,
  DESIGN_BRIEF_SCHEMA_VERSION,
  toDesignBriefDigestSubject,
  validateDesignBrief,
} from "./design-brief.js";
import { isFailureResult, isSuccessResult } from "./results.js";

describe("validateDesignBrief", () => {
  it("accepts the public Design Brief fixture", () => {
    const result = validateDesignBrief(validBrief);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the valid Design Brief fixture to pass.");
    }

    expect(result.data.schemaVersion).toBe(DESIGN_BRIEF_SCHEMA_VERSION);
    expect(result.data.assetType).toBe(DESIGN_BRIEF_ASSET_TYPE);
    expect(result.data.projectId).toBe("hatch-demo");
    expect(result.warnings).toEqual([]);
  });

  it("returns precise paths for invalid relationships and unsafe references", () => {
    const result = validateDesignBrief(invalidCrossReferences);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Design Brief fixture to fail.");
    }

    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/goals/1/id" }),
        expect.objectContaining({ path: "/audiences/0/needs/1" }),
        expect.objectContaining({ path: "/brand/attributes/1" }),
        expect.objectContaining({
          path: "/platforms/0/formFactors/1",
        }),
        expect.objectContaining({
          path: "/platforms/0/inputMethods/1",
        }),
        expect.objectContaining({
          path: "/scenarios/0/audienceIds/0",
        }),
        expect.objectContaining({
          path: "/scenarios/0/audienceIds/1",
        }),
        expect.objectContaining({
          path: "/accessibility/standards/1",
        }),
        expect.objectContaining({ path: "/references/0/url" }),
      ]),
    );
  });

  it("rejects unsupported schema versions before normal validation", () => {
    const result = validateDesignBrief({
      ...validBrief,
      schemaVersion: "2.0.0",
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected an unsupported schema version to fail.");
    }

    expect(result.error).toMatchObject({
      category: "version",
      code: "SCHEMA_VERSION_UNSUPPORTED",
      context: {
        actual: { schemaVersion: "2.0.0" },
        expected: { schemaVersion: "1.0.0" },
      },
    });
  });

  it("rejects missing required fields and unknown properties", () => {
    const withoutProduct: Record<string, unknown> = { ...validBrief };
    delete withoutProduct.product;
    const result = validateDesignBrief({
      ...withoutProduct,
      unexpectedField: true,
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected a structurally invalid brief to fail.");
    }

    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/product" }),
        expect.objectContaining({ path: "/unexpectedField" }),
      ]),
    );
  });

  it("validates identity, asset version and optional digest syntax", () => {
    const result = validateDesignBrief({
      ...validBrief,
      assetVersion: "1.0",
      contentDigest: "sha256:ABC",
      projectId: "Invalid Project",
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected invalid identity fields to fail.");
    }

    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/assetVersion" }),
        expect.objectContaining({ path: "/contentDigest" }),
        expect.objectContaining({ path: "/projectId" }),
      ]),
    );
  });
});

describe("toDesignBriefDigestSubject", () => {
  it("explicitly excludes only the stored content digest", () => {
    const result = validateDesignBrief({
      ...validBrief,
      contentDigest: `sha256:${"a".repeat(64)}`,
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the digest fixture to pass.");
    }

    const subject = toDesignBriefDigestSubject(result.data);

    expect(subject).not.toHaveProperty("contentDigest");
    expect(subject).toMatchObject({
      assetId: "product-foundation",
      assetVersion: "1.0.0",
      projectId: "hatch-demo",
      schemaVersion: "1.0.0",
    });
    expect(JSON.parse(JSON.stringify(subject))).toEqual(subject);
  });
});
