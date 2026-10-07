// Renders the "How Influencer Butler Works" extension guide PDFs (en, es, fr)
// from docs/extension-guide/guide.<lang>.html into public/guides/.
//
// Uses headless Chrome (or Edge) print-to-PDF so the layout matches the HTML
// exactly. Fonts and the logo are local files next to the HTML, so the build is
// offline and reproducible. --export-tagged-pdf keeps the PDF accessible.
//
// Usage:  node scripts/build-extension-guide.mjs [en|es|fr ...]
//         CHROME_PATH=/path/to/chrome node scripts/build-extension-guide.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, "docs", "extension-guide");
const outDir = path.join(root, "public", "guides");
const ALL_LANGS = ["en", "es", "fr"];

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    console.error("No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.");
    process.exit(1);
  }
  return found;
}

const requested = process.argv.slice(2);
const langs = requested.length ? requested : ALL_LANGS;
for (const lang of langs) {
  if (!ALL_LANGS.includes(lang)) {
    console.error(`unknown language "${lang}"; use ${ALL_LANGS.join(", ")}`);
    process.exit(1);
  }
}

const browser = findBrowser();
fs.mkdirSync(outDir, { recursive: true });

for (const lang of langs) {
  const input = path.join(srcDir, `guide.${lang}.html`);
  if (!fs.existsSync(input)) {
    console.error(`missing ${path.relative(root, input)}`);
    process.exit(1);
  }
  const output = path.join(outDir, `influencer-butler-extension-guide-${lang}.pdf`);
  fs.rmSync(output, { force: true });
  execFileSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--export-tagged-pdf",
      "--allow-file-access-from-files",
      "--virtual-time-budget=8000",
      `--print-to-pdf=${output}`,
      pathToFileURL(input).href,
    ],
    { stdio: "ignore" },
  );
  if (!fs.existsSync(output)) {
    console.error(`render failed for ${lang}`);
    process.exit(1);
  }
  console.log(`wrote ${path.relative(root, output)} (${fs.statSync(output).size} bytes)`);
}
