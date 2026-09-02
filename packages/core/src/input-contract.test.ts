import { describe, expect, it } from "vitest";

import validContract from "../../../design-system/hatch-demo/components/input-text.component.json" with { type: "json" };
import validTokens from "../../../design-system/hatch-demo/tokens/input-foundation.tokens.json" with { type: "json" };

import {
  INPUT_CONTENTS,
  INPUT_STATES,
  toInputComponentContractDigestSubject,
  validateInputComponentContract,
  validateInputComponentContractWithTokenSet,
} from "./input-contract.js";

describe("Input Component Contract", () => {
  it("accepts the governed eight-Variant text Input", () => {
    const result = validateInputComponentContractWithTokenSet(
      validContract,
      validTokens,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.profile).toBe("input-v1");
    expect(result.data.layout.fieldHeight).toBeGreaterThanOrEqual(
      result.data.accessibility.minimumInteractiveTarget,
    );
    expect(
      result.data.variants.map(
        ({ selections }) => `${selections.state}/${selections.content}`,
      ),
    ).toEqual(
      INPUT_STATES.flatMap((state) =>
        INPUT_CONTENTS.map((content) => `${state}/${content}`),
      ),
    );
    expect(
      toInputComponentContractDigestSubject(result.data),
    ).not.toHaveProperty("contentDigest");
  });

  it("rejects missing states, approximate identities and placeholder-only labeling", () => {
    const changed = structuredClone(validContract);
    changed.variants[0]!.slotId = "variant/approximate";
    changed.accessibility.placeholderAsOnlyLabelAllowed = true;
    changed.variants.pop();

    const result = validateInputComponentContract(changed);
    expect(result).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });
  });

  it("rejects missing or wrongly typed semantic Token bindings", () => {
    const missing = structuredClone(validTokens);
    missing.modes[0]!.tokens = missing.modes[0]!.tokens.filter(
      ({ path }) => path.join(".") !== "semantic.color.input-border-error",
    );
    expect(
      validateInputComponentContractWithTokenSet(validContract, missing),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });

    const wrongType = structuredClone(validContract);
    wrongType.sharedBindings[0]!.token = "{semantic.dimension.input-height}";
    expect(
      validateInputComponentContractWithTokenSet(wrongType, validTokens),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
  });

  it("rejects unsupported schema versions explicitly", () => {
    expect(
      validateInputComponentContract({
        ...validContract,
        schemaVersion: "2.0.0",
      }),
    ).toMatchObject({
      error: { code: "SCHEMA_VERSION_UNSUPPORTED" },
      ok: false,
    });
  });
});
