import { describe, expect, it } from "vitest";

import {
  HATCHKIT_FIGMA_BRIDGE_HELP,
  parseFigmaBridgeArguments,
} from "./figma-bridge-launch.js";

describe("Figma Bridge launch arguments", () => {
  it("keeps the no-argument Bridge diagnostic-only", () => {
    expect(parseFigmaBridgeArguments([], {})).toEqual({
      data: { approvalVerifier: null, showHelp: false },
      ok: true,
      schemaVersion: "1.0.0",
      warnings: [],
    });
  });

  it("enables the verifier only when project and root are both explicit", () => {
    expect(
      parseFigmaBridgeArguments(
        ["--project", "hatch-demo", "--root", "design-system/hatch-demo"],
        {},
      ),
    ).toMatchObject({
      data: {
        approvalVerifier: {
          designSystemRoot: "design-system/hatch-demo",
          expectedProjectId: "hatch-demo",
        },
        showHelp: false,
      },
      ok: true,
    });
  });

  it("supports environment fallbacks without printing the root", () => {
    const result = parseFigmaBridgeArguments([], {
      HATCHKIT_DESIGN_SYSTEM_ROOT: "/private/catalog",
      HATCHKIT_PROJECT_ID: "hatch-demo",
    });

    expect(result).toMatchObject({
      data: {
        approvalVerifier: {
          designSystemRoot: "/private/catalog",
          expectedProjectId: "hatch-demo",
        },
      },
      ok: true,
    });
  });

  it("rejects partial, duplicate, unknown, and invalid write configuration", () => {
    expect(
      parseFigmaBridgeArguments(["--project", "hatch-demo"], {}),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(
      parseFigmaBridgeArguments(
        ["--project", "Hatch Demo", "--root", "catalog"],
        {},
      ),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
    expect(
      parseFigmaBridgeArguments(
        ["--root", "one", "--root", "two", "--unsafe", "yes"],
        {},
      ),
    ).toMatchObject({ error: { code: "VALIDATION_FAILED" }, ok: false });
  });

  it("returns help without enabling a verifier", () => {
    expect(HATCHKIT_FIGMA_BRIDGE_HELP).toContain("diagnostic-only mode");
    expect(parseFigmaBridgeArguments(["--help"], {})).toMatchObject({
      data: { showHelp: true },
      ok: true,
    });
  });
});
