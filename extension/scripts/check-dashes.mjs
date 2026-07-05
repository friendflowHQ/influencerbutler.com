// Fails the build if any file under the given directories contains an
// em dash (U+2014). The repo rule bans them everywhere; catching it at
// build time keeps them out of shipped extension copy.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXT = new Set([".ts", ".mjs", ".js", ".json", ".html", ".css", ".md", ".txt"]);
const EM_DASH = String.fromCharCode(0x2014);

export function checkDashes(dirs) {
  const offenders = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    walk(dir, offenders);
  }
  if (offenders.length > 0) {
    console.error("em dash (U+2014) found in:");
    for (const file of offenders) console.error("  " + file);
    process.exit(1);
  }
}

function walk(dir, offenders) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, offenders);
    } else if (TEXT_EXT.has(path.extname(entry.name))) {
      const text = fs.readFileSync(full, "utf8");
      if (text.includes(EM_DASH)) offenders.push(full);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  checkDashes([path.join(root, "src"), path.join(root, "static"), path.join(root, "scripts")]);
  console.log("no em dashes found");
}
