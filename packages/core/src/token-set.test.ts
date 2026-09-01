import { describe, expect, it } from "vitest";

import invalidAliases from "../../../design-system/examples/tokens/invalid-aliases.tokens.json" with { type: "json" };
import validTokenSet from "../../../design-system/hatch-demo/tokens/button-foundation.tokens.json" with { type: "json" };

import { isFailureResult, isSuccessResult } from "./results.js";
import {
  DTCG_VERSION,
  TOKEN_SET_ASSET_TYPE,
  TOKEN_SET_SCHEMA_VERSION,
  TOKEN_TYPES,
  parseTokenReference,
  srgbComponentsToHex,
  toTokenSetDigestSubject,
  validateTokenSet,
} from "./token-set.js";

describe("validateTokenSet", () => {
  it("accepts the public Button foundation fixture", () => {
    const result = validateTokenSet(validTokenSet);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the valid Token Set fixture to pass.");
    }

    expect(result.data.schemaVersion).toBe(TOKEN_SET_SCHEMA_VERSION);
    expect(result.data.assetType).toBe(TOKEN_SET_ASSET_TYPE);
    expect(result.data.dtcgVersion).toBe(DTCG_VERSION);
    expect(result.data.modes[0]?.tokens).toHaveLength(31);
    expect(
      new Set(result.data.modes[0]?.tokens.map((token) => token.$type)),
    ).toEqual(new Set(TOKEN_TYPES));
  });

  it("covers every semantic decision frozen by the Button vertical slice", () => {
    const tokens = validTokenSet.modes[0]?.tokens;
    if (tokens === undefined) {
      throw new Error("Expected the public fixture to contain a light mode.");
    }

    const tokenPaths = tokens.map((token) => token.path.join("."));
    expect(tokenPaths).toEqual(
      expect.arrayContaining([
        "semantic.color.action-primary-background",
        "semantic.color.action-primary-foreground",
        "semantic.color.action-primary-disabled-background",
        "semantic.color.action-primary-disabled-foreground",
        "semantic.color.action-secondary-background",
        "semantic.color.action-secondary-foreground",
        "semantic.color.action-secondary-border",
        "semantic.color.action-secondary-disabled-background",
        "semantic.color.action-secondary-disabled-foreground",
        "semantic.color.action-secondary-disabled-border",
        "semantic.dimension.action-height-medium",
        "semantic.dimension.action-padding-inline",
        "semantic.dimension.action-border-width",
        "semantic.dimension.action-radius",
        "semantic.typography.action-label",
        "semantic.number.action-disabled-opacity",
      ]),
    );
  });

  it("accepts a second mode when paths, types and metadata match", () => {
    const lightMode = validTokenSet.modes[0];
    if (lightMode === undefined) {
      throw new Error("Expected the public fixture to contain a light mode.");
    }

    const result = validateTokenSet({
      ...validTokenSet,
      modes: [
        lightMode,
        {
          ...lightMode,
          id: "dark",
          name: "Dark",
        },
      ],
    });

    expect(isSuccessResult(result)).toBe(true);
  });

  it("rejects mode-specific deprecation metadata", () => {
    const lightMode = validTokenSet.modes[0];
    if (lightMode === undefined) {
      throw new Error("Expected the public fixture to contain a light mode.");
    }

    const result = validateTokenSet({
      ...validTokenSet,
      modes: [
        lightMode,
        {
          ...lightMode,
          id: "dark",
          name: "Dark",
          tokens: lightMode.tokens.map((token, index) =>
            index === 0 ? { ...token, $deprecated: true } : token,
          ),
        },
      ],
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected mode-specific deprecation metadata to fail.");
    }

    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/modes/1/tokens/0/$deprecated",
        }),
      ]),
    );
  });

  it("returns paths for mode, alias, layer and parity failures", () => {
    const result = validateTokenSet(invalidAliases);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Token Set fixture to fail.");
    }

    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/defaultMode" }),
        expect.objectContaining({ path: "/modes/0/tokens/1/path" }),
        expect.objectContaining({ path: "/modes/0/tokens/2/$value" }),
        expect.objectContaining({ path: "/modes/0/tokens/3/$value" }),
        expect.objectContaining({ path: "/modes/0/tokens/4/$value" }),
        expect.objectContaining({ path: "/modes/0/tokens/6/$value" }),
        expect.objectContaining({ path: "/modes/0/tokens/7/$value" }),
        expect.objectContaining({ path: "/modes/1/tokens" }),
        expect.objectContaining({ path: "/modes/1/tokens/0/$type" }),
        expect.objectContaining({ path: "/modes/1/tokens/1/path" }),
      ]),
    );
  });

  it("rejects a hex fallback that disagrees with the sRGB components", () => {
    const lightMode = validTokenSet.modes[0];
    const firstToken = lightMode?.tokens[0];
    if (
      lightMode === undefined ||
      firstToken === undefined ||
      firstToken.$type !== "color" ||
      typeof firstToken.$value === "string"
    ) {
      throw new Error("Expected the first fixture token to be a direct color.");
    }

    const result = validateTokenSet({
      ...validTokenSet,
      modes: [
        {
          ...lightMode,
          tokens: lightMode.tokens.map((token, index) =>
            index === 0
              ? {
                  ...firstToken,
                  $value: {
                    colorSpace: "srgb",
                    components: [0.2, 0.4, 1],
                    alpha: 1,
                    hex: "#000000",
                  },
                }
              : token,
          ),
        },
      ],
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the inconsistent hex fallback to fail.");
    }

    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/modes/0/tokens/0/$value/hex" }),
      ]),
    );
  });

  it("rejects unsupported Token Set schema versions", () => {
    const result = validateTokenSet({
      ...validTokenSet,
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
});

describe("Token Set helpers", () => {
  it("parses DTCG aliases and converts sRGB components deterministically", () => {
    expect(parseTokenReference("{primitive.color.brand-600}")).toEqual([
      "primitive",
      "color",
      "brand-600",
    ]);
    expect(parseTokenReference("primitive.color.brand-600")).toBeUndefined();
    expect(srgbComponentsToHex([0.2, 0.4, 1])).toBe("#3366ff");
  });

  it("explicitly excludes only the stored content digest", () => {
    const result = validateTokenSet({
      ...validTokenSet,
      contentDigest: `sha256:${"b".repeat(64)}`,
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the Token Set digest fixture to pass.");
    }

    const subject = toTokenSetDigestSubject(result.data);

    expect(subject).not.toHaveProperty("contentDigest");
    expect(subject).toMatchObject({
      assetId: "button-foundation",
      assetVersion: "1.0.0",
      defaultMode: "light",
      dtcgVersion: "2025.10",
    });
    expect(JSON.parse(JSON.stringify(subject))).toEqual(subject);
  });
});
