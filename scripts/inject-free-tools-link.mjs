// One-off sweep: make the free /tools section discoverable on every static HTML
// page by adding a "Free Tools" nav link (-> /tools) and a matching footer
// Product link. Mirrors scripts/inject-download-links.mjs. The React marketing
// pages get the same link from src/components/blog/SiteChrome.tsx; this script
// only touches public/**/*.html.
//
// Safe to re-run: it skips any nav or footer Product region that already links
// /tools, so a second run reports everything as skipped.
//
// Usage: node scripts/inject-free-tools-link.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (extname(p) === ".html") out.push(p);
  }
  return out;
}

// Matches an existing link to /tools (but not /tools/... deep links, which some
// pages might reference in body copy - we only care about the nav/footer here).
const linksTools = (s) => /href="\/tools"/.test(s);

let navAdded = 0;
let navSkipped = 0;
let footerAdded = 0;
let footerSkipped = 0;
const touched = [];

for (const file of walk(PUBLIC_DIR)) {
  const rel = relative(join(__dirname, ".."), file).replace(/\\/g, "/");
  let content = readFileSync(file, "utf8");
  const original = content;

  // ---- NAV: insert before the Login <li> inside <ul class="nav-menu"> ----
  const navMatch = content.match(/<ul class="nav-menu"[\s\S]*?<\/ul>/);
  if (!navMatch) {
    navSkipped++;
    console.log(`  nav   skip  ${rel} (no nav-menu)`);
  } else {
    const navBlock = navMatch[0];
    if (linksTools(navBlock)) {
      navSkipped++;
      console.log(`  nav   skip  ${rel} (already linked)`);
    } else {
      const loginRe = /([ \t]*)<li><a href="\/login"[^>]*>[\s\S]*?<\/li>/;
      const lm = navBlock.match(loginRe);
      if (lm) {
        const indent = lm[1];
        const injected = `${indent}<li><a href="/tools" class="nav-link">Free Tools</a></li>\n` + lm[0];
        const newNavBlock = navBlock.replace(loginRe, injected);
        content = content.replace(navBlock, newNavBlock);
        navAdded++;
        console.log(`  nav   ADD   ${rel}`);
      } else {
        // No Login item (e.g. legal pages): append before the closing </ul>.
        const closeRe = /(\r?\n)([ \t]*)<\/ul>$/;
        const cm = navBlock.match(closeRe);
        if (!cm) {
          navSkipped++;
          console.log(`  nav   skip  ${rel} (no insertion point)`);
        } else {
          const indent = cm[2] + "    ";
          const injected =
            `${cm[1]}${indent}<li><a href="/tools" class="nav-link">Free Tools</a></li>` +
            `${cm[1]}${cm[2]}</ul>`;
          const newNavBlock = navBlock.replace(closeRe, injected);
          content = content.replace(navBlock, newNavBlock);
          navAdded++;
          console.log(`  nav   ADD   ${rel} (before </ul>)`);
        }
      }
    }
  }

  // ---- FOOTER: insert into the Product column (<div class="footer-links"> with <h4>Product</h4>) ----
  const prodRe = /<div class="footer-links">\s*<h4>Product<\/h4>([\s\S]*?)<\/div>/;
  const pm = content.match(prodRe);
  if (!pm) {
    footerSkipped++;
    console.log(`  foot  skip  ${rel} (no Product column)`);
  } else {
    if (linksTools(pm[1])) {
      footerSkipped++;
      console.log(`  foot  skip  ${rel} (already linked)`);
    } else {
      const newBlock = pm[0].replace(/(\r?\n)([ \t]*)<\/div>$/, (_m, nl, closeIndent) => {
        const linkIndent = closeIndent + "    ";
        return `${nl}${linkIndent}<a href="/tools">Free Tools</a>` + nl + closeIndent + "</div>";
      });
      if (newBlock !== pm[0]) {
        content = content.replace(pm[0], newBlock);
        footerAdded++;
        console.log(`  foot  ADD   ${rel}`);
      } else {
        footerSkipped++;
        console.log(`  foot  skip  ${rel} (no insertion point)`);
      }
    }
  }

  if (content !== original) {
    writeFileSync(file, content, "utf8");
    touched.push(rel);
  }
}

console.log("\n---");
console.log(`nav:    ${navAdded} added, ${navSkipped} skipped`);
console.log(`footer: ${footerAdded} added, ${footerSkipped} skipped`);
console.log(`files written: ${touched.length}`);
