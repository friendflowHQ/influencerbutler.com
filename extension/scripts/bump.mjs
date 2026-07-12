// Bumps the extension version in the two files that must agree:
// package.json (the source of truth, read by scripts/zip.mjs and stamped into
// dist/manifest.json by esbuild.mjs) and static/manifest.json (kept in sync so
// the source stays honest and greppable).
//
// Usage: npm run bump patch|minor|major   (default: patch)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const level = (process.argv[2] || "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(level)) {
  console.error(`unknown bump level "${level}"; use patch, minor, or major`);
  process.exit(1);
}

const pkgPath = path.join(root, "package.json");
const manifestPath = path.join(root, "static", "manifest.json");

const pkgRaw = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgRaw);
const parts = String(pkg.version).split(".").map((n) => parseInt(n, 10));
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error(`package.json version "${pkg.version}" is not a valid x.y.z`);
  process.exit(1);
}
let [major, minor, patch] = parts;
if (level === "major") { major += 1; minor = 0; patch = 0; }
else if (level === "minor") { minor += 1; patch = 0; }
else { patch += 1; }
const next = `${major}.${minor}.${patch}`;

// Rewrite only the version field in each file, preserving formatting.
fs.writeFileSync(
  pkgPath,
  pkgRaw.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`),
);
const manifestRaw = fs.readFileSync(manifestPath, "utf8");
fs.writeFileSync(
  manifestPath,
  manifestRaw.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`),
);

console.log(`bumped ${pkg.version} -> ${next} (package.json + static/manifest.json)`);
