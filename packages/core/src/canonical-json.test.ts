import { describe, expect, it } from "vitest";

import { canonicalizeJson } from "./canonical-json.js";

describe("canonicalizeJson", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalizeJson({ z: 1, a: [3, { b: true, a: "value" }] })).toBe(
      '{"a":[3,{"a":"value","b":true}],"z":1}',
    );
  });

  it("uses JSON number and string serialization", () => {
    expect(canonicalizeJson({ negativeZero: -0, text: "line\nvalue" })).toBe(
      '{"negativeZero":0,"text":"line\\nvalue"}',
    );
  });

  it.each([
    ["non-finite numbers", Number.NaN],
    ["undefined values", { value: undefined }],
    ["non-plain objects", new Date("2026-01-01T00:00:00.000Z")],
  ])("rejects %s", (_label, value) => {
    expect(() => canonicalizeJson(value)).toThrow(TypeError);
  });

  it("rejects circular values", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(() => canonicalizeJson(value)).toThrow("circular");
  });

  it("rejects sparse arrays instead of producing invalid JSON", () => {
    const value = new Array<unknown>(2);
    value[1] = "present";

    expect(() => canonicalizeJson(value)).toThrow("sparse arrays");
  });
});
