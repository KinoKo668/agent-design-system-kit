import { describe, expect, it } from "vitest";

import { HATCHKIT_MCP_HELP, parseHatchkitMcpArguments } from "./stdio.js";

describe("parseHatchkitMcpArguments", () => {
  it("accepts explicit project and catalog root arguments", () => {
    const result = parseHatchkitMcpArguments([
      "--project",
      "hatch-demo",
      "--root",
      "design-system/hatch-demo",
    ]);

    expect(result).toMatchObject({
      data: {
        designSystemRoot: "design-system/hatch-demo",
        expectedProjectId: "hatch-demo",
        showHelp: false,
      },
      ok: true,
    });
  });

  it("uses environment fallbacks without exposing their values in errors", () => {
    const result = parseHatchkitMcpArguments([], {
      HATCHKIT_DESIGN_SYSTEM_ROOT: "design-system/hatch-demo",
      HATCHKIT_PROJECT_ID: "hatch-demo",
    });

    expect(result).toMatchObject({
      data: {
        designSystemRoot: "design-system/hatch-demo",
        expectedProjectId: "hatch-demo",
      },
      ok: true,
    });
  });

  it("returns a shared validation failure for incomplete startup options", () => {
    const result = parseHatchkitMcpArguments(["--project", "hatch-demo"]);

    expect(result).toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        target: { type: "command" },
      },
      ok: false,
    });
    expect(JSON.stringify(result)).toContain("missing_required_option");
  });

  it("exposes help without requiring startup options", () => {
    const result = parseHatchkitMcpArguments(["--help"]);

    expect(result).toMatchObject({ data: { showHelp: true }, ok: true });
    expect(HATCHKIT_MCP_HELP).toContain(
      "Protocol messages are the only stdout output.",
    );
  });
});
