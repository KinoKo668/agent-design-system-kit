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

  it("enables the Writer only from a complete environment pair", () => {
    const environment = {
      HATCHKIT_DESIGN_SYSTEM_ROOT: "design-system/hatch-demo",
      HATCHKIT_FIGMA_BRIDGE_TOKEN: "stdio-test-session-token-32-characters",
      HATCHKIT_FIGMA_BRIDGE_URL: "http://127.0.0.1:38451",
      HATCHKIT_PROJECT_ID: "hatch-demo",
    };
    expect(parseHatchkitMcpArguments([], environment)).toMatchObject({
      data: {
        writerOptions: {
          sessionToken: environment.HATCHKIT_FIGMA_BRIDGE_TOKEN,
          url: environment.HATCHKIT_FIGMA_BRIDGE_URL,
        },
      },
      ok: true,
    });
    const incomplete = parseHatchkitMcpArguments([], {
      HATCHKIT_DESIGN_SYSTEM_ROOT: environment.HATCHKIT_DESIGN_SYSTEM_ROOT,
      HATCHKIT_FIGMA_BRIDGE_TOKEN: environment.HATCHKIT_FIGMA_BRIDGE_TOKEN,
      HATCHKIT_PROJECT_ID: environment.HATCHKIT_PROJECT_ID,
    });
    expect(incomplete).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });
    expect(JSON.stringify(incomplete)).not.toContain(
      environment.HATCHKIT_FIGMA_BRIDGE_TOKEN,
    );
    const unsafe = parseHatchkitMcpArguments([], {
      ...environment,
      HATCHKIT_FIGMA_BRIDGE_URL: "https://writer.example.com",
    });
    expect(unsafe).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
      ok: false,
    });
  });

  it("exposes help without requiring startup options", () => {
    const result = parseHatchkitMcpArguments(["--help"]);

    expect(result).toMatchObject({ data: { showHelp: true }, ok: true });
    expect(HATCHKIT_MCP_HELP).toContain(
      "Protocol messages are the only stdout output.",
    );
  });
});
