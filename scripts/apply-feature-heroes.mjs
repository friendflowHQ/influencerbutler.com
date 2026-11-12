/**
 * Summary: Points each static feature page (public/features/<slug>.html) at its
 *   captured hero screenshot, public/assets/features/<slug>-hero.webp, produced by
 *   the desktop repo's `node tutorials/screens.mjs --slugs=feature-heroes`.
 *   - A page whose hero <img> points at a missing file gets the .webp src.
 *   - A page with a "Screenshot: ..." placeholder div gets a real <img>.
 *   - Pages whose current hero file exists are left alone unless --refresh.
 *   Prints what changed; --dry shows the plan without writing.
 * Usage: node scripts/apply-feature-heroes.mjs [--dry] [--refresh]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FEATURES = path.join(ROOT, "public", "features");
const ASSETS = path.join(ROOT, "public", "assets", "features");
const dry = process.argv.includes("--dry");
const refresh = process.argv.includes("--refresh");

const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

let changed = 0;
for (const file of fs.readdirSync(FEATURES).filter((f) => f.endsWith(".html"))) {
  const slug = file.replace(/\.html$/, "");
  const webp = path.join(ASSETS, `${slug}-hero.webp`);
  if (!fs.existsSync(webp)) continue;
  const p = path.join(FEATURES, file);
  let html = fs.readFileSync(p, "utf8");
  const before = html;
  const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1]?.trim() || slug;
  const src = `/assets/features/${slug}-hero.webp`;

  // 1. Existing hero <img> inside .feature-hero-image.
  html = html.replace(
    /(<div class="feature-hero-image">\s*<img\s+[^>]*?src=")([^"]+)("[^>]*>)/,
    (m, a, cur, b) => {
      const exists = fs.existsSync(path.join(ROOT, "public", cur.replace(/^\//, "")));
      if (exists && !refresh) return m;
      return `${a}${src}${b.replace(/\s*width="\d+"|\s*height="\d+"/g, "").replace(/\s*\/?>$/, ' width="1440" height="900" loading="eager" decoding="async">')}`;
    }
  );

  // 2. Placeholder block -> real image.
  html = html.replace(
    /<div class="feature-image-placeholder">[\s\S]*?<\/div>/,
    () => `<img src="${src}" alt="${escAttr(`${title} in the Influencer Butler app`)}" width="1440" height="900" loading="eager" decoding="async">`
  );

  // Drop the "ASSET NEEDED ... DROP IN" authoring note once the hero is real.
  if (html.includes(`src="${src}"`)) {
    html = html.replace(/\s*<!--[^]*?ASSET NEEDED[^]*?-->/, "");
  }

  if (html !== before) {
    changed += 1;
    console.log(`${dry ? "would update" : "updated"} ${file} -> ${src}`);
    if (!dry) fs.writeFileSync(p, html);
  }
}
console.log(`${changed} page(s) ${dry ? "to update" : "updated"}`);
