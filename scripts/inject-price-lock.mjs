// Idempotent codemod: inject the price lock banner script tag (Nov 12 - Nov 30 2026; the script removes itself after the deadline) into every public/**/*.html
// Run via `npm run inject:price-lock` or as a `prebuild` hook.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

const SCRIPT_TAG = '<script src="/js/price-lock-banner.js" defer></script>';
const MARKER = 'src="/js/price-lock-banner.js"';

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      yield full;
    }
  }
}

async function injectInto(file) {
  const html = await readFile(file, "utf8");
  if (html.includes(MARKER)) return false;

  let updated;
  if (/<\/body>/i.test(html)) {
    updated = html.replace(/<\/body>/i, `  ${SCRIPT_TAG}\n  </body>`);
  } else if (/<\/html>/i.test(html)) {
    updated = html.replace(/<\/html>/i, `${SCRIPT_TAG}\n</html>`);
  } else {
    updated = `${html}\n${SCRIPT_TAG}\n`;
  }
  await writeFile(file, updated);
  return true;
}

async function main() {
  let scanned = 0;
  let modified = 0;
  for await (const file of walk(publicDir)) {
    scanned++;
    if (await injectInto(file)) {
      modified++;
      console.log(`  + injected: ${path.relative(repoRoot, file)}`);
    }
  }
  console.log(`inject-price-lock: scanned ${scanned} files, modified ${modified}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
