import { describe, expect, it } from "vitest";

import { isPlatformMarkerCandidate } from "./platform-marker-candidate.js";

describe("isPlatformMarkerCandidate", () => {
  it("keeps an official marker in scope when its assetType was tampered", () => {
    expect(
      isPlatformMarkerCandidate(
        JSON.stringify({
          assetType: "tampered",
          bindingId: "button/ios-26-phone",
          componentKey: "apple_button_key_100",
          platformTargetId: "ios-26-phone",
        }),
      ),
    ).toBe(true);
  });

  it("does not misclassify another Hatchkit asset marker", () => {
    expect(
      isPlatformMarkerCandidate(
        JSON.stringify({ assetType: "button", componentId: "button" }),
      ),
    ).toBe(false);
  });

  it("keeps a malformed serialized official marker in audit scope", () => {
    expect(
      isPlatformMarkerCandidate('{"assetType":"official-platform-instance"'),
    ).toBe(true);
  });
});
