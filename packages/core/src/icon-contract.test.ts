import { describe, expect, it } from "vitest";

import validIconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import validIconTokenSet from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import {
  ICON_ASSET_ID,
  ICON_CONTRACT_PROFILE,
  ICON_CONTRACT_SCHEMA_VERSION,
  toIconComponentContractDigestSubject,
  validateIconComponentContract,
  validateIconComponentContractWithTokenSet,
} from "./icon-contract.js";
import { isFailureResult, isSuccessResult } from "./results.js";

describe("validateIconComponentContract", () => {
  it("accepts the public three-size rounded-stroke Icon contract", () => {
    const result = validateIconComponentContract(validIconContract);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the public Icon Contract to pass.");
    }
    expect(result.data).toMatchObject({
      assetId: ICON_ASSET_ID,
      profile: ICON_CONTRACT_PROFILE,
      schemaVersion: ICON_CONTRACT_SCHEMA_VERSION,
      accessibility: {
        defaultPresentation: "decorative",
        minimumInteractiveTarget: 44,
        semanticUsageRequiresAccessibleName: true,
      },
      geometry: { opticalGrid: 24, strokeWidth: 2 },
    });
    expect(
      result.data.variants.map(({ selections }) => selections.size),
    ).toEqual(["small", "medium", "large"]);
  });

  it("rejects incomplete sizes, non-semantic bindings and geometry drift", () => {
    const invalid = {
      ...validIconContract,
      geometry: { ...validIconContract.geometry, strokeWidth: 1 },
      sharedBindings: [
        {
          target: "glyph.stroke",
          token: "{primitive.color.neutral-900}",
        },
      ],
      variants: validIconContract.variants.slice(0, 2),
    };

    const result = validateIconComponentContract(invalid);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Icon Contract to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/geometry/strokeWidth" }),
        expect.objectContaining({ path: "/sharedBindings/0/token" }),
        expect.objectContaining({ path: "/variants" }),
      ]),
    );
  });

  it("rejects unsupported schema versions before normal validation", () => {
    const result = validateIconComponentContract({
      ...validIconContract,
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

describe("validateIconComponentContractWithTokenSet", () => {
  it("validates every Icon binding against the declared Token Set", () => {
    const result = validateIconComponentContractWithTokenSet(
      validIconContract,
      validIconTokenSet,
    );

    expect(isSuccessResult(result)).toBe(true);
  });

  it("reports missing or mistyped Token bindings at the contract path", () => {
    const missingTokenSet = {
      ...validIconTokenSet,
      modes: validIconTokenSet.modes.map((mode) => ({
        ...mode,
        tokens: mode.tokens.filter(
          (token) => token.path.join(".") !== "semantic.color.icon-default",
        ),
      })),
    };
    const result = validateIconComponentContractWithTokenSet(
      validIconContract,
      missingTokenSet,
    );

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected a missing Icon Token to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/sharedBindings/0/token" }),
      ]),
    );
  });
});

describe("toIconComponentContractDigestSubject", () => {
  it("excludes only the stored content digest", () => {
    const result = validateIconComponentContract({
      ...validIconContract,
      contentDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the Icon digest fixture to pass.");
    }

    const subject = toIconComponentContractDigestSubject(result.data);

    expect(subject).not.toHaveProperty("contentDigest");
    expect(subject).toMatchObject({
      assetId: "icon/check",
      assetVersion: "1.0.0",
      profile: "icon-v1",
    });
    expect(JSON.parse(JSON.stringify(subject))).toEqual(subject);
  });
});
