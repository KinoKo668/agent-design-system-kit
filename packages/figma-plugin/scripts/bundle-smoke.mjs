import { stat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(packageRoot, "manifest.json");
const pluginPath = resolve(packageRoot, "dist/plugin.js");
const uiPath = resolve(packageRoot, "dist/ui.html");

const [manifestText, pluginJavaScript, uiHtml, pluginStat, uiStat] =
  await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(pluginPath, "utf8"),
    readFile(uiPath, "utf8"),
    stat(pluginPath),
    stat(uiPath),
  ]);
const manifest = JSON.parse(manifestText);

const failures = [];
function requireCondition(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

requireCondition(manifest.main === "dist/plugin.js", "manifest main mismatch");
requireCondition(manifest.ui === "dist/ui.html", "manifest UI mismatch");
requireCondition(
  /^\d+$/u.test(manifest.id),
  "manifest must use a Figma-assigned numeric plugin ID",
);
requireCondition(
  manifest.documentAccess === "dynamic-page",
  "dynamic page access is required",
);
requireCondition(
  JSON.stringify(manifest.networkAccess?.allowedDomains) ===
    JSON.stringify(["none"]),
  "production network access must remain disabled",
);
requireCondition(
  JSON.stringify(manifest.networkAccess?.devAllowedDomains) ===
    JSON.stringify(["http://localhost:38451"]),
  "the local development Bridge must be the only allowed development domain",
);
requireCondition(
  pluginJavaScript.includes("figma.showUI"),
  "main bundle missing UI startup",
);
requireCondition(
  pluginJavaScript.includes("figma.ui.onmessage"),
  "main bundle missing message boundary",
);
requireCondition(
  !pluginJavaScript.includes("@agent-design-system-kit/"),
  "main bundle contains a workspace import",
);
requireCondition(
  !/^\s*import\s/mu.test(pluginJavaScript),
  "main bundle is not an IIFE",
);
requireCondition(
  !uiHtml.includes("HATCHKIT_UI_SCRIPT"),
  "UI placeholder was not replaced",
);
requireCondition(
  uiHtml.includes("ui.ready"),
  "UI bundle missing ready handshake",
);
requireCondition(
  uiHtml.includes("Approval gate"),
  "UI missing approval status",
);
requireCondition(
  uiHtml.includes("Action needed"),
  "UI missing error recovery surface",
);
requireCondition(
  uiHtml.includes("Bridge Session Token"),
  "UI missing the in-memory Bridge credential field",
);
requireCondition(
  uiHtml.includes("writer.execute"),
  "UI bundle missing the Writer execution boundary",
);
requireCondition(
  pluginJavaScript.includes("writer.ping"),
  "main bundle missing the safe diagnostic command",
);
requireCondition(pluginStat.size <= 100 * 1024, "main bundle exceeds 100 KiB");
requireCondition(uiStat.size <= 300 * 1024, "UI bundle exceeds 300 KiB");

if (failures.length > 0) {
  throw new Error(
    `Figma Plugin bundle smoke failed:\n- ${failures.join("\n- ")}`,
  );
}

process.stdout.write(
  `Hatchkit Figma Plugin bundle passed (${String(pluginStat.size)} byte main, ${String(uiStat.size)} byte UI).\n`,
);
