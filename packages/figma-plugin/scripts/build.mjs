import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["src/index.ts"],
  format: "iife",
  globalName: "AgentDesignSystemKitPlugin",
  legalComments: "none",
  logLevel: "info",
  outfile: "dist/plugin.js",
  platform: "browser",
  sourcemap: true,
  target: "es2022",
});
