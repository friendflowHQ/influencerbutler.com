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
const watch = process.argv.includes("--watch");
// The self-hosted build ships the Instagram Goldmine feature; the default build
// (the published Web Store listing) must NOT, so it stays Amazon-only. See
// docs/chrome-web-store-publishing.md and the plan in CLAUDE-adjacent notes.
const selfHosted = process.argv.includes("--selfhosted");
const dist = path.join(root, selfHosted ? "dist-selfhosted" : "dist");
const staticDir = path.join(root, "static");

checkDashes([path.join(root, "src"), staticDir]);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(staticDir, dist, { recursive: true });

// The Goldmine page is a self-hosted-only surface. Its HTML/CSS live in static/
// (shared by both builds), so drop them from the public build: it never emits
// goldmine.js and nothing links to the page, so they would only be dead weight.
if (!selfHosted) {
  for (const file of ["goldmine.html", "goldmine.css"]) {
    fs.rmSync(path.join(dist, file), { force: true });
  }
}

// package.json is the single source of truth for the release version. Stamp it
// into the shipped manifest so the packaged manifest can never drift from the
// version scripts/zip.mjs uses to name the zip. static/manifest.json is kept in
// sync by scripts/bump.mjs, but this guarantees the built artifact regardless.
// In the self-hosted build we ALSO patch the manifest to add the instagram.com
// host permission and the Goldmine content script, leaving static/manifest.json
// (the published listing's manifest) untouched.
{
  const { version } = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const manifestPath = path.join(dist, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let changed = false;
  if (manifest.version !== version) {
    manifest.version = version;
    changed = true;
    console.log(`stamped manifest version ${version} from package.json`);
  }
  if (selfHosted) {
    manifest.name = `${manifest.name} (Self-Hosted)`;
    manifest.host_permissions = [
      ...manifest.host_permissions,
      "https://www.instagram.com/*",
      "https://instagram.com/*",
    ];
    manifest.content_scripts = [
      ...manifest.content_scripts,
      {
        matches: ["https://www.instagram.com/*", "https://instagram.com/*"],
        js: ["instagram-content.js"],
        run_at: "document_idle",
      },
    ];
    changed = true;
    console.log("patched manifest for the self-hosted (Instagram Goldmine) build");
  }
  if (changed) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
}

const common = {
  bundle: true,
  target: "es2022",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  loader: { ".css": "text", ".png": "dataurl" },
  // Build-time feature flag. false in the default build makes every Instagram
  // code path dead-code-eliminate out (see src/build-flags.d.ts).
  define: { IB_IG_ENABLED: JSON.stringify(selfHosted) },
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
    entryPoints: [path.join(root, "src/content/connect-hook.ts")],
    outfile: path.join(dist, "connect-hook.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/content/deals-hook.ts")],
    outfile: path.join(dist, "deals-hook.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/popup/index.ts")],
    outfile: path.join(dist, "popup.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/options/index.ts")],
    outfile: path.join(dist, "options.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/deals/index.ts")],
    outfile: path.join(dist, "deals.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/links/index.ts")],
    outfile: path.join(dist, "links.js"),
    format: "iife",
  },
  {
    ...common,
    entryPoints: [path.join(root, "src/chat/index.ts")],
    outfile: path.join(dist, "chat.js"),
    format: "iife",
  },
];

// Instagram Goldmine bundles are built ONLY for the self-hosted variant, so the
// public build never even emits goldmine.js / instagram-content.js.
if (selfHosted) {
  builds.push(
    {
      ...common,
      entryPoints: [path.join(root, "src/goldmine/index.ts")],
      outfile: path.join(dist, "goldmine.js"),
      format: "iife",
    },
    {
      ...common,
      entryPoints: [path.join(root, "src/instagram/content.ts")],
      outfile: path.join(dist, "instagram-content.js"),
      format: "iife",
    },
  );
}

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log(`watching extension sources; load ${path.basename(dist)}/ as an unpacked extension`);
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log(`extension built to ${path.basename(dist)}/`);
}
