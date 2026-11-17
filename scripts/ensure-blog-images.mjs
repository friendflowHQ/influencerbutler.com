/**
 * Summary: Guarantees every blog post's hero image exists so the /blog listing,
 *   the article page and social share cards never show a broken image.
 *   Collects each post's `image` from content/blog/_index.json and from every
 *   content/blog/*.mdx frontmatter (frontmatter wins on the article page), and
 *   for any local path that is missing from public/:
 *     - default (prebuild): copies public/assets/blog/_fallback.png into place
 *       and prints a loud warning, so the deploy ships a branded placeholder
 *       instead of a broken image. The copy is not committed; run
 *       `node scripts/generate-missing-blog-heroes.mjs` and commit the result
 *       to give the post its real hero.
 *     - --check: changes nothing and exits 1, for local use before a commit.
 *
 *   Never probes public/ at request time (that bundles public/ into the
 *   serverless function); this runs once at build time instead.
 *
 * Usage:
 *   node scripts/ensure-blog-images.mjs           (fill gaps with the fallback)
 *   node scripts/ensure-blog-images.mjs --check   (report only, exit 1 on gaps)
 *
 * Dependencies: node:fs, node:path.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");
const blogDir = path.join(repoRoot, "content", "blog");
const fallbackPath = path.join(publicDir, "assets", "blog", "_fallback.png");
const checkOnly = process.argv.includes("--check");

// image path -> list of sources that reference it
const refs = new Map();
const addRef = (img, source) => {
  if (typeof img !== "string") return;
  const clean = img.trim().replace(/^["']|["']$/g, "");
  if (!clean.startsWith("/") || clean.startsWith("//")) return; // remote URLs are not ours to check
  if (!refs.has(clean)) refs.set(clean, []);
  refs.get(clean).push(source);
};

const manifest = JSON.parse(fs.readFileSync(path.join(blogDir, "_index.json"), "utf8"));
for (const post of manifest.posts || []) {
  if (post.retired) continue;
  addRef(post.image, `_index.json:${post.id}`);
  if (post.pinImage) addRef(post.pinImage, `_index.json:${post.id} (pinImage)`);
}

for (const file of fs.readdirSync(blogDir)) {
  if (!file.endsWith(".mdx") && !file.endsWith(".md")) continue;
  const text = fs.readFileSync(path.join(blogDir, file), "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) continue;
  const line = fm[1].match(/^image:\s*(.+)$/m);
  if (line) addRef(line[1], file);
}

const missing = [...refs.entries()].filter(([img]) => !fs.existsSync(path.join(publicDir, img.replace(/^\//, ""))));

if (!missing.length) {
  console.log(`ensure-blog-images: all ${refs.size} blog image(s) present.`);
  process.exit(0);
}

const list = missing.map(([img, sources]) => `  ${img}  (${[...new Set(sources)].join(", ")})`).join("\n");

if (checkOnly) {
  console.error(
    `ensure-blog-images: ${missing.length} blog image(s) missing:\n${list}\n` +
      "Fix: node scripts/generate-missing-blog-heroes.mjs, then commit the PNGs."
  );
  process.exit(1);
}

if (!fs.existsSync(fallbackPath)) {
  console.error(
    `ensure-blog-images: ${missing.length} blog image(s) missing and no fallback at ${path.relative(repoRoot, fallbackPath)}:\n${list}`
  );
  process.exit(1);
}

for (const [img] of missing) {
  const out = path.join(publicDir, img.replace(/^\//, ""));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(fallbackPath, out);
}
console.warn(
  `\n!! ensure-blog-images: ${missing.length} blog image(s) were missing and got the generic fallback hero:\n${list}\n` +
    "!! Give them real heroes: node scripts/generate-missing-blog-heroes.mjs, then commit the PNGs.\n"
);
