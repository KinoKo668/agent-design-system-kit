import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "src");
const outputRoot = resolve(packageRoot, "dist");
const uiScriptPlaceholder = "<!-- HATCHKIT_UI_SCRIPT -->";

await mkdir(outputRoot, { recursive: true });

await build({
  bundle: true,
  entryPoints: [resolve(sourceRoot, "main.ts")],
  format: "iife",
  globalName: "HatchkitWriterPlugin",
  legalComments: "none",
  logLevel: "info",
  outfile: resolve(outputRoot, "plugin.js"),
  platform: "browser",
  sourcemap: true,
  target: "es2022",
});

const uiBuild = await build({
  bundle: true,
  entryPoints: [resolve(sourceRoot, "ui.ts")],
  format: "iife",
  legalComments: "none",
  logLevel: "silent",
  outfile: "ui.js",
  platform: "browser",
  sourcemap: "inline",
  target: "es2022",
  write: false,
});
const uiJavaScript = uiBuild.outputFiles[0]?.text;
if (uiJavaScript === undefined) {
  throw new Error("The Figma UI JavaScript bundle was not produced.");
}

const uiTemplate = await readFile(resolve(sourceRoot, "ui.html"), "utf8");
if (uiTemplate.split(uiScriptPlaceholder).length !== 2) {
  throw new Error("The Figma UI template must contain one script placeholder.");
}
const uiHtml = uiTemplate.replace(
  uiScriptPlaceholder,
  `<script>${uiJavaScript}</script>`,
);
await writeFile(resolve(outputRoot, "ui.html"), uiHtml, "utf8");
