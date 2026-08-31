import { describe, expect, it } from "vitest";

import {
  REDACTED_FIGMA_URL,
  REDACTED_PATH,
  REDACTED_VALUE,
  isSensitiveFieldName,
  redactJsonObject,
  redactSensitiveText,
} from "./security.js";

describe("sensitive field detection", () => {
  it("recognizes credential aliases without confusing design-token fields", () => {
    expect(isSensitiveFieldName("X-Figma-Token")).toBe(true);
    expect(isSensitiveFieldName("client_secret")).toBe(true);
    expect(isSensitiveFieldName("figmaFileKey")).toBe(true);
    expect(isSensitiveFieldName("designTokenId")).toBe(false);
    expect(isSensitiveFieldName("tokenCount")).toBe(false);
  });
});

describe("redactSensitiveText", () => {
  it("removes exact runtime values and common credential forms", () => {
    const secret = "example-runtime-credential-value";
    const redacted = redactSensitiveText(
      `Bearer ${secret} X-Figma-Token: ${secret} HATCH_FIGMA_ACCESS_TOKEN=${secret}`,
      { sensitiveValues: [secret] },
    );

    expect(redacted).toBe(
      `Bearer ${REDACTED_VALUE} X-Figma-Token: ${REDACTED_VALUE} HATCH_FIGMA_ACCESS_TOKEN=${REDACTED_VALUE}`,
    );
    expect(redacted).not.toContain(secret);
  });

  it("removes Figma URLs and personal filesystem paths", () => {
    const redacted = redactSensitiveText(
      "Open https://www.figma.com/file/private-key/demo?node-id=1%3A2 at /Users/example/Projects/hatch/file.json or C:\\Users\\example\\hatch\\file.json",
      { sensitiveValues: [] },
    );

    expect(redacted).toBe(
      `Open ${REDACTED_FIGMA_URL} at ${REDACTED_PATH} or ${REDACTED_PATH}`,
    );
  });

  it("handles duplicate and overlapping secret values deterministically", () => {
    expect(
      redactSensitiveText("long-secret and secret", {
        sensitiveValues: ["secret", "long-secret", "secret", ""],
      }),
    ).toBe(`${REDACTED_VALUE} and ${REDACTED_VALUE}`);
  });
});

describe("redactJsonObject", () => {
  it("redacts nested sensitive fields without mutating the input", () => {
    const input = {
      accessToken: "raw-token",
      designTokenId: "color.action.primary",
      nested: {
        authorizationHeader: "Bearer raw-token",
        items: ["raw-token", { figmaNodeId: "1:2", safe: true }],
      },
    } as const;

    const redacted = redactJsonObject(input, {
      sensitiveValues: ["raw-token"],
    });

    expect(redacted).toEqual({
      accessToken: REDACTED_VALUE,
      designTokenId: "color.action.primary",
      nested: {
        authorizationHeader: REDACTED_VALUE,
        items: [REDACTED_VALUE, { figmaNodeId: REDACTED_VALUE, safe: true }],
      },
    });
    expect(input.accessToken).toBe("raw-token");
    expect(JSON.parse(JSON.stringify(redacted))).toEqual(redacted);
  });
});
