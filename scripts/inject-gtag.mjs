// Idempotent codemod: make public/js/consent.js the SINGLE Google Analytics
// loader on every static public/**/*.html page, matching the App Router.
//
// History: this script used to inject a raw gtag.js block straight into each
// page's <head>. That block called gtag('config', ...) immediately, before
// consent.js (loaded with `defer`) could set Consent Mode v2 defaults, so pages
// that also loaded consent.js double-loaded gtag.js and fired a pre-consent
// ping, and pages that did NOT load consent.js ran GA with no consent banner at
// all. consent.js already loads gtag.js itself under Consent Mode, so the raw
// block is both redundant and wrong.
//
// Now this script: (1) strips any legacy raw gtag block, and (2) guarantees the
// consent.js loader is present (it is the proper consent-gated GA loader).
// Run via `npm run inject:gtag` or the `prebuild` hook.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

const CONSENT_TAG = `<script src="/js/consent.js" defer></script>`;

// Matches the legacy machine-injected gtag block regardless of indentation,
// including a trailing newline, so it can be removed cleanly. Bounded,
// non-greedy: it consumes exactly one block up to its gtag('config') + </script>.
const LEGACY_GTAG_RE = new RegExp(
  "[ \\t]*<!-- Google tag \\(gtag\\.js\\) -->\\s*" +
    '<script async src="https://www\\.googletagmanager\\.com/gtag/js\\?id=G-S1TC1QLYNN"></script>\\s*' +
    "<script>[\\s\\S]*?gtag\\('config', 'G-S1TC1QLYNN'\\);\\s*</script>\\n?",
  "g",
);

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

async function fixFile(file) {
  const html = await readFile(file, "utf8");
  let updated = html;
  const actions = [];

  // 1) Strip any legacy raw gtag block(s).
  if (LEGACY_GTAG_RE.test(updated)) {
    updated = updated.replace(LEGACY_GTAG_RE, "");
    actions.push("stripped-gtag");
  }

  // 2) Ensure the consent.js loader is present (it loads GA under Consent Mode).
  if (!updated.includes("/js/consent.js")) {
    const block = `  ${CONSENT_TAG}\n`;
    if (/<\/head>/i.test(updated)) {
      updated = updated.replace(/<\/head>/i, `${block}</head>`);
    } else if (/<body[^>]*>/i.test(updated)) {
      updated = updated.replace(/<body[^>]*>/i, (match) => `${block}${match}`);
    } else {
      updated = `${block}${updated}`;
    }
    actions.push("added-consent");
  }

  if (updated === html) return null;
  await writeFile(file, updated);
  return actions.join("+");
}

async function main() {
  let scanned = 0;
  let modified = 0;
  for await (const file of walk(publicDir)) {
    scanned++;
    const action = await fixFile(file);
    if (action) {
      modified++;
      console.log(`  + ${action}: ${path.relative(repoRoot, file)}`);
    }
  }
  console.log(`inject-gtag: scanned ${scanned} files, modified ${modified}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
