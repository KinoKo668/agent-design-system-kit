import { describe, expect, it } from "vitest";

import validBrief from "../../../design-system/hatch-demo/briefs/hatch-demo.brief.json" with { type: "json" };
import validButtonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validDirectionReview from "../../../design-system/hatch-demo/directions/hatch-demo.direction-review.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import { canonicalizeJson } from "./canonical-json.js";
import {
  validateDesignSystemIntegrity,
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";
import { isFailureResult, isSuccessResult } from "./results.js";

const CONTRACT_DIGEST = validButtonContract.contentDigest;
const PUBLIC_BRIEF_DIGEST_SUBJECT: Record<string, unknown> = { ...validBrief };
delete PUBLIC_BRIEF_DIGEST_SUBJECT.contentDigest;
const BRIEF_DIGEST_SUBJECT = canonicalizeJson(PUBLIC_BRIEF_DIGEST_SUBJECT);
const PUBLIC_CONTRACT_DIGEST_SUBJECT: Record<string, unknown> = {
  ...validButtonContract,
};
delete PUBLIC_CONTRACT_DIGEST_SUBJECT.contentDigest;
const CONTRACT_DIGEST_SUBJECT = canonicalizeJson(
  PUBLIC_CONTRACT_DIGEST_SUBJECT,
);
const PUBLIC_DIRECTION_DIGEST_SUBJECT: Record<string, unknown> = {
  ...validDirectionReview,
};
delete PUBLIC_DIRECTION_DIGEST_SUBJECT.contentDigest;
const DIRECTION_DIGEST_SUBJECT = canonicalizeJson(
  PUBLIC_DIRECTION_DIGEST_SUBJECT,
);

function computeDigest(value: unknown): string {
  const canonical = canonicalizeJson(value);
  if (canonical === BRIEF_DIGEST_SUBJECT) {
    return validDirectionReview.briefSource.contentDigest;
  }
  if (canonical === CONTRACT_DIGEST_SUBJECT) return CONTRACT_DIGEST;
  if (canonical === DIRECTION_DIGEST_SUBJECT) {
    return validDirectionReview.contentDigest;
  }
  return `sha256:${"e".repeat(64)}`;
}

function validDocuments(): DesignSystemSourceDocument[] {
  return [
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
      value: { ...validButtonContract, contentDigest: CONTRACT_DIGEST },
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: validRegistry,
    },
  ];
}

function expectIssue(
  result: ReturnType<typeof validateDesignSystemSnapshot>,
  expected: Record<string, unknown>,
): void {
  expect(isFailureResult(result)).toBe(true);
  if (!isFailureResult(result)) {
    throw new Error("Expected design-system integrity validation to fail.");
  }
  expect(result.error.context?.details?.issues).toEqual(
    expect.arrayContaining([expect.objectContaining(expected)]),
  );
}

describe("validateDesignSystemSnapshot", () => {
  it("loads a valid cross-referenced design-system snapshot", () => {
    const result = validateDesignSystemSnapshot("hatch-demo", validDocuments());

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected a valid design-system snapshot.");
    }
    expect(result.data).toMatchObject({
      projectId: "hatch-demo",
      briefs: [{ sourcePath: "briefs/product.brief.json" }],
      tokenSets: [{ sourcePath: "tokens/foundation.tokens.json" }],
      components: [{ sourcePath: "components/button.component.json" }],
      directions: [
        { sourcePath: "directions/foundation.direction-review.json" },
      ],
      registries: [{ sourcePath: "registry/components.registry.json" }],
    });
  });

  it("reports the component path when its Token Set is missing", () => {
    const documents = validDocuments().filter(
      (document) => document.kind !== "token-set",
    );
    const result = validateDesignSystemSnapshot("hatch-demo", documents);

    expectIssue(result, {
      code: "missing_reference",
      path: "/tokenSource",
      sourcePath: "components/button.component.json",
    });
  });

  it("reports both files that define the same asset identity", () => {
    const documents = validDocuments();
    documents.push({
      kind: "component",
      sourcePath: "components/copy/button.component.json",
      value: { ...validButtonContract, contentDigest: CONTRACT_DIGEST },
    });
    const result = validateDesignSystemSnapshot("hatch-demo", documents);

    expectIssue(result, {
      code: "duplicate_asset",
      relatedSourcePath: "components/button.component.json",
      sourcePath: "components/copy/button.component.json",
    });
  });

  it("reports the Registry and Contract paths for digest mismatch", () => {
    const documents = validDocuments();
    const entry = validRegistry.entries[0];
    if (entry === undefined) {
      throw new Error("Expected the valid Registry fixture.");
    }
    const mismatchedDigest = `sha256:${"e".repeat(64)}`;
    const mismatchedDocuments = documents.map((document) =>
      document.kind === "component-registry"
        ? {
            ...document,
            value: {
              ...validRegistry,
              entries: [
                {
                  ...entry,
                  asset: { ...entry.asset, contentDigest: mismatchedDigest },
                  figma: {
                    ...entry.figma,
                    appliedDigest: mismatchedDigest,
                  },
                },
              ],
            },
          }
        : document,
    );

    const result = validateDesignSystemSnapshot(
      "hatch-demo",
      mismatchedDocuments,
    );

    expectIssue(result, {
      code: "content_digest_mismatch",
      path: "/entries/0/asset/contentDigest",
      relatedSourcePath: "components/button.component.json",
      sourcePath: "registry/components.registry.json",
    });
  });

  it("rejects absolute and parent-traversing source paths", () => {
    for (const unsafePath of [
      "/tmp/button.component.json",
      "../button.component.json",
    ]) {
      const result = validateDesignSystemSnapshot("hatch-demo", [
        {
          kind: "component",
          sourcePath: unsafePath,
          value: validButtonContract,
        },
      ]);

      expectIssue(result, {
        code: "unsafe_source_path",
        path: "/sourcePath",
        sourcePath: ".",
      });
    }
  });
});

describe("validateDesignSystemIntegrity", () => {
  it("validates the public catalog and its stored content digest", () => {
    const result = validateDesignSystemIntegrity(
      "hatch-demo",
      validDocuments(),
      computeDigest,
    );

    expect(isSuccessResult(result)).toBe(true);
  });

  it("reports digest drift using the source-relative Component path", () => {
    const documents = validDocuments().map((document) =>
      document.kind === "component"
        ? {
            ...document,
            value: {
              ...validButtonContract,
              description: "Changed without updating contentDigest.",
            },
          }
        : document,
    );
    const result = validateDesignSystemIntegrity(
      "hatch-demo",
      documents,
      computeDigest,
    );

    expectIssue(result, {
      code: "content_digest_mismatch",
      path: "/contentDigest",
      sourcePath: "components/button.component.json",
    });
  });

  it("fails safely when the runtime digest adapter throws", () => {
    const result = validateDesignSystemIntegrity(
      "hatch-demo",
      validDocuments(),
      () => {
        throw new Error("adapter failure");
      },
    );

    expect(isFailureResult(result)).toBe(true);
    if (isFailureResult(result)) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
    }
  });
});
