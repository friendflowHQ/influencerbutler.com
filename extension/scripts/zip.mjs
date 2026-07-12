// Packages dist/ into influencer-butler-extension-<version>.zip for the
// Chrome Web Store. Requires a prior `npm run build`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The self-hosted build (Instagram Goldmine) is packaged from dist-selfhosted/
// under a distinct name; it is distributed off the Web Store.
const selfHosted = process.argv.includes("--selfhosted");
const dist = path.join(root, selfHosted ? "dist-selfhosted" : "dist");
const buildCmd = selfHosted ? "npm run build:selfhosted" : "npm run build";
if (!fs.existsSync(path.join(dist, "manifest.json"))) {
  console.error(`${path.basename(dist)}/ is missing or incomplete; run \`${buildCmd}\` first`);
  process.exit(1);
}
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const suffix = selfHosted ? "-selfhosted" : "";
const out = path.join(root, `influencer-butler-extension${suffix}-${version}.zip`);
fs.rmSync(out, { force: true });

if (process.platform === "win32") {
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${dist}\\*' -DestinationPath '${out}'`,
  ]);
} else {
  execFileSync("zip", ["-r", out, "."], { cwd: dist });
}
console.log(`wrote ${out}`);
