const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SHARED_NAMESPACE,
  IDS,
  PRIMITIVE_TOKENS,
  SEMANTIC_TOKENS,
  buildVariantSpecs,
  codeSyntaxFor,
  hexToRgb,
  stableIdForVariable
} = require("../code.js");

test("creates the frozen four-variant matrix", () => {
  assert.deepEqual(buildVariantSpecs(), [
    { appearance: "Primary", state: "Default" },
    { appearance: "Primary", state: "Disabled" },
    { appearance: "Secondary", state: "Default" },
    { appearance: "Secondary", state: "Disabled" }
  ]);
});

test("keeps logical identities deterministic", () => {
  assert.match(SHARED_NAMESPACE, /^[A-Za-z0-9_.]+$/);
  assert.equal(IDS.componentSet, "button");
  assert.equal(
    stableIdForVariable(IDS.semanticCollection, "button/radius"),
    "spike-001/collection/semantics/variable/button/radius"
  );
});

test("defines unique tokens with targeted scopes", () => {
  const tokens = [...PRIMITIVE_TOKENS, ...SEMANTIC_TOKENS];
  assert.equal(new Set(tokens.map((token) => token.name)).size, tokens.length);
  assert.equal(tokens.some((token) => token.scopes.includes("ALL_SCOPES")), false);
  assert.equal(SEMANTIC_TOKENS.every((token) => token.scopes.length > 0), true);
  assert.equal(
    SEMANTIC_TOKENS.find((token) => token.name === "button/opacity/enabled").value,
    100
  );
  assert.equal(
    SEMANTIC_TOKENS.find((token) => token.name === "button/opacity/disabled").value,
    55
  );
});

test("converts colors and code syntax predictably", () => {
  assert.deepEqual(hexToRgb("#FFFFFF"), { r: 1, g: 1, b: 1 });
  assert.equal(codeSyntaxFor("button/radius"), "var(--ads-button-radius)");
  assert.throws(() => hexToRgb("red"), /Unsupported color value/);
});
