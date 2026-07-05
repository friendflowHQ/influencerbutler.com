// Build script for the Influencer Butler extension.
// Bundles background (esm), content (iife), and popup (iife) into dist/,
// copies static/ alongside, and refuses to build if any source or static
// file contains an em dash (project-wide rule, see repo CLAUDE.md).
import * as esbuild from "esbuild";
import { checkDashes } from "./scripts/check-dashes.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const staticDir = path.join(root, "static");
const watch = process.argv.includes("--watch");

checkDashes([path.join(root, "src"), staticDir]);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(staticDir, dist, { recursive: true });

const common = {
  bundle: true,
  target: "es2022",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  loader: { ".css": "text" },
};

const builds = [
  {
    ...common,
    entryPoints: [path.join(root, "src/background/index.ts")],
    outfile: path.join(dist, "background.js"),
    format: "esm",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/content/index.ts")],
    outfile: path.join(dist, "content.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/content/page-hook.ts")],
    outfile: path.join(dist, "page-hook.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/popup/index.ts")],
    outfile: path.join(dist, "popup.js"),
    format: "iife",
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching extension sources; load dist/ as an unpacked extension");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log("extension built to dist/");
}
