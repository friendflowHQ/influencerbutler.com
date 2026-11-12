/**
 * Summary: Verifies every image referenced by Help & Tutorials MDX
 *   (`![alt](/assets/...)`, including `{locale}` paths) and every <img> on the
 *   static feature pages (public/features/*.html) points at a file that exists
 *   in public/. A `{locale}` image missing for es-ES/fr-FR is a warning (the
 *   renderer falls back to en-US); missing en-US or a missing plain path is an
 *   error. Also flags images without alt text and em dashes in alt/captions.
 * Usage: node scripts/check-tutorial-images.mjs   (exit 1 on errors)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUB = path.join(ROOT, "public");
const TUT = path.join(ROOT, "content", "tutorials");
const exists = (src) => fs.existsSync(path.join(PUB, decodeURI(src).replace(/^\//, "").split("?")[0]));

const errors = [];
const warnings = [];
let checked = 0;

for (const file of fs.readdirSync(TUT).filter((f) => f.endsWith(".mdx"))) {
  const locale = (file.match(/\.([a-z]{2}-[A-Z]{2})\.mdx$/) || [])[1] || "en-US";
  const lines = fs.readFileSync(path.join(TUT, file), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g)) {
      const [, alt, src, cap] = m;
      checked += 1;
      const where = `${file}:${i + 1}`;
      if (!alt.trim()) errors.push(`${where}: image without alt text (${src})`);
      if (/[—]/.test(`${alt}${cap || ""}`)) errors.push(`${where}: em dash in alt/caption`);
      if (src.includes("{locale}")) {
        const own = src.split("{locale}").join(locale);
        const en = src.split("{locale}").join("en-US");
        if (!exists(en)) errors.push(`${where}: missing ${en}`);
        else if (!exists(own)) warnings.push(`${where}: ${locale} shot not captured yet, falls back to en-US (${own})`);
      } else if (src.startsWith("/assets/") && !exists(src)) {
        errors.push(`${where}: missing ${src}`);
      }
    }
  });
}

const FEAT = path.join(PUB, "features");
for (const file of fs.readdirSync(FEAT).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(FEAT, file), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of html.matchAll(/<img\s[^>]*src="([^"]+)"[^>]*>/g)) {
    const src = m[1];
    if (/^https?:|^data:/.test(src)) continue;
    checked += 1;
    const abs = src.startsWith("/") ? src : `/features/${src}`;
    if (!exists(abs)) errors.push(`features/${file}: missing ${src}`);
    if (!/\salt="[^"]+"/.test(m[0])) errors.push(`features/${file}: <img> without alt (${src})`);
  }
}

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`${checked} image reference(s) checked: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
