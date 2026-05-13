// Idempotent codemod: inject the Google Analytics (gtag.js) snippet into every
// public/**/*.html. Run via `npm run inject:gtag` or as a `prebuild` hook.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

const GA_ID = "G-S1TC1QLYNN";
const GTAG_BLOCK = `<!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>`;
const MARKER = `id=${GA_ID}`;

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
  if (/<\/head>/i.test(html)) {
    updated = html.replace(/<\/head>/i, `  ${GTAG_BLOCK}\n</head>`);
  } else if (/<body[^>]*>/i.test(html)) {
    updated = html.replace(/<body[^>]*>/i, (match) => `${GTAG_BLOCK}\n${match}`);
  } else {
    updated = `${GTAG_BLOCK}\n${html}`;
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
  console.log(`inject-gtag: scanned ${scanned} files, modified ${modified}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
