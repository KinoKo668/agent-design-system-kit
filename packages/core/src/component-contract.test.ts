import { describe, expect, it } from "vitest";

import validButtonContract from "../../../design-system/hatch-demo/components/button.component.json" with { type: "json" };
import validIconContract from "../../../design-system/hatch-demo/components/icon-check.component.json" with { type: "json" };
import validIconTokenSet from "../../../design-system/hatch-demo/tokens/icon-foundation.tokens.json" with { type: "json" };

import {
  toComponentContractDigestSubject,
  validateComponentContract,
  validateComponentContractWithTokenSet,
} from "./component-contract.js";
import { isFailureResult, isSuccessResult } from "./results.js";

describe("Component Contract profile dispatch", () => {
  it("accepts the supported Button and Icon profiles", () => {
    const button = validateComponentContract(validButtonContract);
    const icon = validateComponentContract(validIconContract);

    expect(isSuccessResult(button)).toBe(true);
    expect(isSuccessResult(icon)).toBe(true);
    if (isSuccessResult(button) && isSuccessResult(icon)) {
      expect(button.data.profile).toBe("button-v1");
      expect(icon.data.profile).toBe("icon-v1");
      expect(toComponentContractDigestSubject(icon.data)).not.toHaveProperty(
        "contentDigest",
      );
    }
  });

  it("dispatches Token validation by the exact profile", () => {
    const result = validateComponentContractWithTokenSet(
      validIconContract,
      validIconTokenSet,
    );

    expect(isSuccessResult(result)).toBe(true);
    if (isSuccessResult(result)) expect(result.data.profile).toBe("icon-v1");
  });

  it("rejects unknown profiles instead of treating them as Button", () => {
    const result = validateComponentContract({
      ...validIconContract,
      profile: "invented-icon-v9",
    });

    expect(isFailureResult(result)).toBe(true);
    if (isFailureResult(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.context?.details?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "/profile" })]),
      );
    }
  });
});
