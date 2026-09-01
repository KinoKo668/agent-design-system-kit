import { describe, expect, it } from "vitest";

import validButtonContract from "../../../design-system/examples/components/button.component.json" with { type: "json" };
import validRegistry from "../../../design-system/examples/registry/components.registry.json" with { type: "json" };
import validTokenSet from "../../../design-system/examples/tokens/button-foundation.tokens.json" with { type: "json" };

import { resolveComponent, searchComponents } from "./component-query.js";
import {
  validateDesignSystemSnapshot,
  type DesignSystemSnapshot,
  type DesignSystemSourceDocument,
} from "./design-system-snapshot.js";
import { isFailureResult, isSuccessResult } from "./results.js";

const CONTRACT_DIGEST = `sha256:${"d".repeat(64)}`;

function createSnapshot(
  figmaStatus: "ready" | "unbuilt" = "ready",
): DesignSystemSnapshot {
  const entry = validRegistry.entries[0];
  if (entry === undefined) {
    throw new Error("Expected the valid Registry fixture.");
  }
  const registry =
    figmaStatus === "ready"
      ? validRegistry
      : {
          ...validRegistry,
          entries: [
            {
              ...entry,
              figma: {
                channel: entry.figma.channel,
                fileBindingId: entry.figma.fileBindingId,
                majorVersion: entry.figma.majorVersion,
                role: entry.figma.role,
                slotId: entry.figma.slotId,
                status: "unbuilt",
              },
            },
          ],
        };
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
      value: registry,
    },
  ]);
  if (!isSuccessResult(result)) {
    throw new Error("Expected a valid design-system snapshot.");
  }
  return result.data;
}

function createHistoricalSnapshot(): DesignSystemSnapshot {
  const fixtureEntry = validRegistry.entries[0];
  if (fixtureEntry === undefined || fixtureEntry.figma.status !== "ready") {
    throw new Error("Expected a ready Registry fixture.");
  }
  const oldDigest = `sha256:${"a".repeat(64)}`;
  const newDigest = `sha256:${"b".repeat(64)}`;
  const documents: DesignSystemSourceDocument[] = [
    {
      kind: "token-set",
      sourcePath: "tokens/foundation.tokens.json",
      value: validTokenSet,
    },
    {
      kind: "component",
      sourcePath: "components/button-1.0.0.component.json",
      value: { ...validButtonContract, contentDigest: oldDigest },
    },
    {
      kind: "component",
      sourcePath: "components/button-1.1.0.component.json",
      value: {
        ...validButtonContract,
        assetVersion: "1.1.0",
        contentDigest: newDigest,
      },
    },
    {
      kind: "component-registry",
      sourcePath: "registry/components.registry.json",
      value: {
        ...validRegistry,
        entries: [
          {
            ...fixtureEntry,
            asset: { ...fixtureEntry.asset, contentDigest: oldDigest },
            figma: { ...fixtureEntry.figma, appliedDigest: oldDigest },
            lifecycle: "superseded",
            lifecycleReason: "Replaced by the compatible 1.1.0 update.",
            replacedBy: "1.1.0",
            supersedes: null,
          },
          {
            ...fixtureEntry,
            approvalId: "approval.component.button.1.1.0",
            asset: {
              ...fixtureEntry.asset,
              contentDigest: newDigest,
              version: "1.1.0",
            },
            figma: {
              ...fixtureEntry.figma,
              appliedDigest: newDigest,
              appliedVersion: "1.1.0",
            },
            supersedes: "1.0.0",
          },
        ],
      },
    },
  ];
  const result = validateDesignSystemSnapshot("hatch-demo", documents);
  if (!isSuccessResult(result)) {
    throw new Error("Expected a valid historical snapshot.");
  }
  return result.data;
}

function expectFailureCode(
  result: ReturnType<typeof resolveComponent>,
  code: string,
): void {
  expect(isFailureResult(result)).toBe(true);
  if (!isFailureResult(result)) {
    throw new Error("Expected component resolution to fail.");
  }
  expect(result.error.code).toBe(code);
}

describe("searchComponents", () => {
  it("finds Button by exact case-insensitive identity or display name", () => {
    const snapshot = createSnapshot();

    for (const term of ["button", "Button", "button-v1"]) {
      const result = searchComponents(snapshot, {
        projectId: "hatch-demo",
        term,
      });

      expect(isSuccessResult(result)).toBe(true);
      if (!isSuccessResult(result)) {
        throw new Error("Expected component search to succeed.");
      }
      expect(result.data.total).toBe(1);
      expect(result.data.items[0]).toMatchObject({
        asset: { id: "button", version: "1.0.0" },
        availability: "figma-ready",
        figmaStatus: "ready",
        lifecycle: "active",
        sources: {
          contractSourcePath: "components/button.component.json",
          registrySourcePath: "registry/components.registry.json",
        },
      });
    }
  });

  it("does not use fuzzy names or silently return an approximation", () => {
    const result = searchComponents(createSnapshot(), {
      projectId: "hatch-demo",
      term: "buton",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected component search to succeed.");
    }
    expect(result.data.items).toEqual([]);
    expect(result.data.total).toBe(0);
  });

  it("defaults to Active and exposes history only when explicitly requested", () => {
    const snapshot = createHistoricalSnapshot();
    const active = searchComponents(snapshot, {
      projectId: "hatch-demo",
      assetId: "button",
    });
    const history = searchComponents(snapshot, {
      projectId: "hatch-demo",
      assetId: "button",
      lifecycle: "any",
    });

    expect(isSuccessResult(active)).toBe(true);
    expect(isSuccessResult(history)).toBe(true);
    if (!isSuccessResult(active) || !isSuccessResult(history)) {
      throw new Error("Expected component history search to succeed.");
    }
    expect(active.data.items.map((item) => item.asset.version)).toEqual([
      "1.1.0",
    ]);
    expect(history.data.items.map((item) => item.asset.version)).toEqual([
      "1.1.0",
      "1.0.0",
    ]);
    expect(history.data.items[1]?.availability).toBe("unavailable");
  });

  it("rejects malformed search filters with field paths", () => {
    const result = searchComponents(createSnapshot(), {
      projectId: "Hatch Demo",
      unexpected: true,
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected malformed component search to fail.");
    }
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/projectId" }),
        expect.objectContaining({ path: "/unexpected" }),
      ]),
    );
  });
});

describe("resolveComponent", () => {
  it("resolves the unique Active Ready Button and its default Variant", () => {
    const result = resolveComponent(createSnapshot(), {
      assetId: "button",
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected Button resolution to succeed.");
    }
    expect(result.data).toMatchObject({
      nextAction: "verify-approval-and-audit-then-insert-instance",
      selectedVariant: {
        id: "appearance-primary/state-default",
        slotId: "variant/appearance-primary/state-default",
      },
      status: "figma-ready",
      variantSelections: { appearance: "primary", state: "default" },
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "APPROVAL_GUARD_REQUIRED" }),
      expect.objectContaining({ code: "FIGMA_AUDIT_REQUIRED" }),
    ]);
  });

  it("resolves an exact non-default Variant declared by the Contract", () => {
    const result = resolveComponent(createSnapshot(), {
      assetId: "button",
      projectId: "hatch-demo",
      variantSelections: { appearance: "secondary", state: "disabled" },
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected Button Variant resolution to succeed.");
    }
    expect(result.data.selectedVariant).toMatchObject({
      id: "appearance-secondary/state-disabled",
      name: "Secondary / Disabled",
    });
  });

  it("returns Ensure Required instead of pretending Unbuilt is insertable", () => {
    const result = resolveComponent(createSnapshot("unbuilt"), {
      assetId: "button",
      projectId: "hatch-demo",
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected Unbuilt Button resolution to succeed.");
    }
    expect(result.data).toMatchObject({
      nextAction: "verify-approval-then-ensure-library-asset",
      registryEntry: { figma: { status: "unbuilt" } },
      status: "ensure-required",
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "APPROVAL_GUARD_REQUIRED" }),
      expect.objectContaining({ code: "FIGMA_ENSURE_REQUIRED" }),
    ]);
  });

  it("returns Not Found for typos, another project and inactive versions", () => {
    const snapshot = createHistoricalSnapshot();
    for (const query of [
      { assetId: "buton", projectId: "hatch-demo" },
      { assetId: "button", projectId: "another-project" },
      {
        assetId: "button",
        assetVersion: "1.0.0",
        projectId: "hatch-demo",
      },
    ]) {
      const result = resolveComponent(snapshot, query);
      expectFailureCode(result, "IDENTITY_NOT_FOUND");
    }
  });

  it("rejects unknown properties and unsupported Variant options", () => {
    const result = resolveComponent(createSnapshot(), {
      assetId: "button",
      projectId: "hatch-demo",
      variantSelections: { appearance: "tertiary", tone: "quiet" },
    });

    expectFailureCode(result, "VALIDATION_FAILED");
    if (!isFailureResult(result)) {
      throw new Error("Expected invalid Variant selection to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_variant_option",
          path: "/variantSelections/appearance",
        }),
        expect.objectContaining({
          code: "unknown_variant_property",
          path: "/variantSelections/tone",
        }),
      ]),
    );
  });

  it("fails closed when more than one Active Registry entry matches", () => {
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

    const result = resolveComponent(conflictingSnapshot, {
      assetId: "button",
      projectId: "hatch-demo",
    });

    expectFailureCode(result, "IDENTITY_CONFLICT");
    if (!isFailureResult(result)) {
      throw new Error("Expected ambiguous resolution to fail.");
    }
    expect(result.error.context).toMatchObject({
      actual: { matchCount: 2 },
      details: {
        sourcePaths: [
          "registry/components.registry.json",
          "registry/conflicting.registry.json",
        ],
      },
    });
    expect(JSON.stringify(result.error)).not.toContain("100:200");
  });
});
