import { describe, expect, it } from "vitest";

import validButtonContract from "../../../design-system/examples/components/button.component.json" with { type: "json" };
import invalidButtonContract from "../../../design-system/examples/components/invalid-button.component.json" with { type: "json" };
import validTokenSet from "../../../design-system/examples/tokens/button-foundation.tokens.json" with { type: "json" };

import {
  BUTTON_BINDING_TARGET_TYPES,
  BUTTON_CONTRACT_PROFILE,
  BUTTON_CONTRACT_SCHEMA_VERSION,
  COMPONENT_ASSET_TYPE,
  toButtonComponentContractDigestSubject,
  validateButtonComponentContract,
  validateButtonComponentContractWithTokenSet,
} from "./button-contract.js";
import { isFailureResult, isSuccessResult } from "./results.js";

describe("validateButtonComponentContract", () => {
  it("accepts the frozen Button v1 fixture", () => {
    const result = validateButtonComponentContract(validButtonContract);

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the valid Button Contract fixture to pass.");
    }

    expect(result.data.schemaVersion).toBe(BUTTON_CONTRACT_SCHEMA_VERSION);
    expect(result.data.assetType).toBe(COMPONENT_ASSET_TYPE);
    expect(result.data.profile).toBe(BUTTON_CONTRACT_PROFILE);
    expect(result.data.properties).toHaveLength(3);
    expect(result.data.variants).toHaveLength(4);
    expect(result.data.variants.map(({ slotId }) => slotId)).toEqual([
      "variant/appearance-primary/state-default",
      "variant/appearance-primary/state-disabled",
      "variant/appearance-secondary/state-default",
      "variant/appearance-secondary/state-disabled",
    ]);
  });

  it("resolves every binding against the declared Token Set", () => {
    const result = validateButtonComponentContractWithTokenSet(
      validButtonContract,
      validTokenSet,
    );

    expect(isSuccessResult(result)).toBe(true);
    expect(BUTTON_BINDING_TARGET_TYPES).toMatchObject({
      "container.fill": "color",
      "container.height": "dimension",
      "container.opacity": "number",
      "label.typography": "typography",
    });
  });

  it("returns stable paths for property, matrix, slot and binding failures", () => {
    const result = validateButtonComponentContract(invalidButtonContract);

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected the invalid Button Contract fixture to fail.");
    }

    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/properties/0" }),
        expect.objectContaining({ path: "/properties/1/defaultOptionId" }),
        expect.objectContaining({ path: "/properties/1/options/2/id" }),
        expect.objectContaining({ path: "/sharedBindings/1/target" }),
        expect.objectContaining({ path: "/sharedBindings" }),
        expect.objectContaining({ path: "/variants/0/selections" }),
        expect.objectContaining({ path: "/variants/0/id" }),
        expect.objectContaining({ path: "/variants/0/slotId" }),
        expect.objectContaining({ path: "/variants/0/name" }),
        expect.objectContaining({ path: "/variants/2/bindings" }),
        expect.objectContaining({ path: "/variants/3/selections" }),
        expect.objectContaining({ path: "/variants" }),
      ]),
    );
  });

  it("rejects direct Primitive bindings before cross-asset resolution", () => {
    const result = validateButtonComponentContract({
      ...validButtonContract,
      sharedBindings: validButtonContract.sharedBindings.map(
        (binding, index) =>
          index === 0
            ? {
                ...binding,
                token: "{primitive.dimension.control-height-medium}",
              }
            : binding,
      ),
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected a Primitive component binding to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/sharedBindings/0/token" }),
      ]),
    );
  });

  it("rejects duplicate stable and Figma property identities", () => {
    const labelProperty = validButtonContract.properties[0];
    if (labelProperty === undefined) {
      throw new Error("Expected the fixture to contain the Label property.");
    }

    const result = validateButtonComponentContract({
      ...validButtonContract,
      properties: [
        validButtonContract.properties[0],
        validButtonContract.properties[1],
        labelProperty,
      ],
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected duplicate property identities to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/properties/2/id" }),
        expect.objectContaining({ path: "/properties/2/figmaName" }),
        expect.objectContaining({ path: "/properties" }),
      ]),
    );
  });

  it("reports Token source, missing reference and type mismatches together", () => {
    const result = validateButtonComponentContractWithTokenSet(
      {
        ...validButtonContract,
        variants: validButtonContract.variants.map((variant, variantIndex) =>
          variantIndex === 0
            ? {
                ...variant,
                bindings: variant.bindings.map((binding, bindingIndex) => {
                  if (bindingIndex === 0) {
                    return {
                      ...binding,
                      token: "{semantic.dimension.action-height-medium}",
                    };
                  }
                  if (bindingIndex === 1) {
                    return {
                      ...binding,
                      token: "{semantic.color.does-not-exist}",
                    };
                  }
                  return binding;
                }),
              }
            : variant,
        ),
      },
      { ...validTokenSet, projectId: "another-project" },
    );

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected cross-asset Token binding checks to fail.");
    }
    expect(result.error.context?.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/tokenSource/projectId" }),
        expect.objectContaining({
          path: "/variants/0/bindings/0/token",
        }),
        expect.objectContaining({
          path: "/variants/0/bindings/1/token",
        }),
      ]),
    );
  });

  it("rejects unsupported Contract schema versions", () => {
    const result = validateButtonComponentContract({
      ...validButtonContract,
      schemaVersion: "2.0.0",
    });

    expect(isFailureResult(result)).toBe(true);
    if (!isFailureResult(result)) {
      throw new Error("Expected an unsupported Contract version to fail.");
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

describe("Button Component Contract digest projection", () => {
  it("explicitly excludes only the stored content digest", () => {
    const result = validateButtonComponentContract({
      ...validButtonContract,
      contentDigest: `sha256:${"c".repeat(64)}`,
    });

    expect(isSuccessResult(result)).toBe(true);
    if (!isSuccessResult(result)) {
      throw new Error("Expected the Contract digest fixture to pass.");
    }

    const subject = toButtonComponentContractDigestSubject(result.data);
    expect(subject).not.toHaveProperty("contentDigest");
    expect(subject).toMatchObject({
      assetId: "button",
      assetVersion: "1.0.0",
      profile: "button-v1",
      tokenSource: {
        assetId: "button-foundation",
        assetVersion: "1.0.0",
      },
    });
    expect(JSON.parse(JSON.stringify(subject))).toEqual(subject);
  });
});
