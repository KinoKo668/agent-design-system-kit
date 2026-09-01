import { describe, expect, it } from "vitest";

import validBrief from "../../../design-system/examples/briefs/hatch-demo.brief.json" with { type: "json" };
import validButtonContract from "../../../design-system/examples/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/examples/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/examples/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  validateDesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";
import { isFailureResult, isSuccessResult } from "./results.js";

const CONTRACT_DIGEST = `sha256:${"d".repeat(64)}`;

function validDocuments(): DesignSystemSourceDocument[] {
  return [
    {
      kind: "brief",
      sourcePath: "briefs/product.brief.json",
      value: validBrief,
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
