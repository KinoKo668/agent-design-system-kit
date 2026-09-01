import { describe, expect, it } from "vitest";

import validButtonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import invalidRegistry from "../../../design-system/examples/registry/invalid-components.registry.json" with { type: "json" };
import validRegistry from "../../../design-system/hatch-demo/registry/components.registry.json" with { type: "json" };

import {
  COMPONENT_REGISTRY_SCHEMA_VERSION,
  COMPONENT_REGISTRY_TYPE,
  compareSemanticVersions,
  validateComponentRegistry,
  validateComponentRegistryWithButtonContract,
} from "./component-registry.js";
import { isFailureResult, isSuccessResult } from "./results.js";

const CONTRACT_DIGEST = validButtonContract.contentDigest;

describe("validateComponentRegistry", () => {
  it("accepts the public Button Registry fixture", () => {
    const result = validateComponentRegistry(validRegistry);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the valid Component Registry fixture to pass.");
    }
    expect(result.data.schemaVersion).toBe(COMPONENT_REGISTRY_SCHEMA_VERSION);
    expect(result.data.registryType).toBe(COMPONENT_REGISTRY_TYPE);
    expect(result.data.entries).toHaveLength(1);
    expect(result.data.entries[0]).toMatchObject({
      approvalId: "approval.component.button.1.0.0",
      asset: { id: "button", version: "1.0.0" },
      figma: { majorVersion: 1, status: "ready" },
      lifecycle: "active",
    });
  });

  it("associates the exact Contract digest with its Approval and Figma asset", () => {
    const result = validateComponentRegistryWithButtonContract(validRegistry, {
      ...validButtonContract,
      contentDigest: CONTRACT_DIGEST,
    });

    expect(isSuccessResult(result)).toBe(true);
  });

  it("accepts an approved but not-yet-built Figma target", () => {
    const entry = validRegistry.entries[0];
    if (entry === undefined) {
      throw new Error("Expected the Registry fixture to contain Button.");
    }
    const result = validateComponentRegistry({
      ...validRegistry,
      entries: [
        {
          ...entry,
          figma: {
            status: "unbuilt",
            fileBindingId: "00000000-0000-4000-8000-000000000001",
            channel: "library",
            majorVersion: 1,
            role: "component-set",
            slotId: "root",
          },
        },
      ],
    });

    expect(isSuccessResult(result)).toBe(true);
  });

  it("accepts reciprocal history on one reusable Figma major track", () => {
    const entry = validRegistry.entries[0];
    if (entry === undefined || entry.figma.status !== "ready") {
      throw new Error("Expected a ready Button Registry fixture.");
    }
    const oldDigest = `sha256:${"a".repeat(64)}`;
    const newDigest = `sha256:${"b".repeat(64)}`;
    const result = validateComponentRegistry({
      ...validRegistry,
      entries: [
        {
          ...entry,
          approvalId: "approval.component.button.1.0.0",
          asset: { ...entry.asset, contentDigest: oldDigest },
          figma: { ...entry.figma, appliedDigest: oldDigest },
          lifecycle: "superseded",
          lifecycleReason: "Replaced by the compatible 1.1.0 update.",
          replacedBy: "1.1.0",
          supersedes: null,
        },
        {
          ...entry,
          approvalId: "approval.component.button.1.1.0",
          asset: {
            ...entry.asset,
            contentDigest: newDigest,
            version: "1.1.0",
          },
          figma: {
            ...entry.figma,
            appliedDigest: newDigest,
            appliedVersion: "1.1.0",
          },
          supersedes: "1.0.0",
        },
      ],
    });

    expect(isSuccessResult(result)).toBe(true);
  });

  it("returns stable paths for identity, lifecycle, history and locator failures", () => {
    const result = validateComponentRegistry(invalidRegistry);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Registry fixture to fail.");
    }
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/entries/0/approvalId" }),
        expect.objectContaining({ path: "/entries/0/figma/majorVersion" }),
        expect.objectContaining({ path: "/entries/0/figma/appliedVersion" }),
        expect.objectContaining({ path: "/entries/0/figma/appliedDigest" }),
        expect.objectContaining({ path: "/entries/0/lifecycleReason" }),
        expect.objectContaining({ path: "/entries/0/replacedBy" }),
        expect.objectContaining({ path: "/entries/0/supersedes" }),
        expect.objectContaining({ path: "/entries/1/lifecycle" }),
        expect.objectContaining({
          path: "/entries/2/figma/locator/nodeId",
        }),
        expect.objectContaining({
          path: "/entries/2/figma/locator/componentSetKey",
        }),
      ]),
    );
  });

  it("requires an exact verified Contract digest before registration", () => {
    const missingDigest = validateComponentRegistryWithButtonContract(
      validRegistry,
      { ...validButtonContract, contentDigest: undefined },
    );
    const mismatchedDigest = validateComponentRegistryWithButtonContract(
      validRegistry,
      {
        ...validButtonContract,
        contentDigest: `sha256:${"e".repeat(64)}`,
      },
    );

    for (const result of [missingDigest, mismatchedDigest]) {
      expect(isFailureResult(result)).toBe(true);
      if (!isFailureResult(result)) {
        throw new Error("Expected Registry digest association to fail.");
      }
      expect(result.error.context?.details?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/entries/0/asset/contentDigest",
          }),
        ]),
      );
    }
  });

  it("reports project and missing Contract identities without guessing", () => {
    const entry = validRegistry.entries[0];
    if (entry === undefined || entry.figma.status !== "ready") {
      throw new Error("Expected a ready Button Registry fixture.");
    }
    const result = validateComponentRegistryWithButtonContract(
      {
        ...validRegistry,
        projectId: "another-project",
        entries: [
          {
            ...entry,
            approvalId: "approval.component.input.1.0.0",
            asset: { ...entry.asset, id: "input" },
          },
        ],
      },
      { ...validButtonContract, contentDigest: CONTRACT_DIGEST },
    );

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected Registry identity association to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/projectId" }),
        expect.objectContaining({ path: "/entries" }),
      ]),
    );
  });

  it("rejects unsupported Registry schema versions", () => {
    const result = validateComponentRegistry({
      ...validRegistry,
      schemaVersion: "2.0.0",
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected an unsupported Registry version to fail.");
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
});

describe("compareSemanticVersions", () => {
  it("uses SemVer precedence for Registry history", () => {
    expect(compareSemanticVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareSemanticVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(
      compareSemanticVersions("1.0.0-alpha.2", "1.0.0-alpha.10"),
    ).toBeLessThan(0);
    expect(
      compareSemanticVersions("1.0.0-alpha-a", "1.0.0-alpha-b"),
    ).toBeLessThan(0);
    expect(compareSemanticVersions("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
    expect(compareSemanticVersions("1.0.0+one", "1.0.0+two")).toBe(0);
  });
});
