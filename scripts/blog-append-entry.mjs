/**
 * Summary: Appends one post entry to content/blog/_index.json safely (parses,
 *   pushes, validates, writes back pretty-printed), instead of hand-editing
 *   the JSON file repeatedly which risks a broken trailing comma or bracket.
 *
 * Usage: node scripts/blog-append-entry.mjs <path-to-entry.json>
 *   where entry.json is a single post object matching the existing schema.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "content", "blog", "_index.json");

const entryPath = process.argv[2];
if (!entryPath) {
  console.error("Usage: node scripts/blog-append-entry.mjs <path-to-entry.json>");
  process.exit(1);
}

const entry = JSON.parse(fs.readFileSync(entryPath, "utf8"));
const required = ["id", "title", "category", "tags", "summary", "date", "author", "readingTime", "keywords", "image", "imageAlt", "imagePrompt", "order"];
for (const k of required) {
  if (!(k in entry)) {
    console.error(`Entry missing required field: ${k}`);
    process.exit(1);
  }
}

const data = JSON.parse(fs.readFileSync(indexPath, "utf8"));
if (data.posts.some((p) => p.id === entry.id)) {
  console.error(`Entry id already exists in _index.json: ${entry.id}`);
  process.exit(1);
}

data.posts.push(entry);
fs.writeFileSync(indexPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Appended "${entry.id}" (date ${entry.date}). Total posts: ${data.posts.length}`);

// Hand-added posts used to ship without a hero (broken image on /blog). Flag it now.
const heroPath = path.join(repoRoot, "public", String(entry.image).replace(/^\//, ""));
if (String(entry.image).startsWith("/") && !fs.existsSync(heroPath)) {
  console.warn(
    `\nHero image ${entry.image} does not exist yet. Render it before committing:\n` +
      `  node scripts/generate-missing-blog-heroes.mjs --only=${entry.id}\n` +
      `  (or the AI version: node scripts/generate-blog-images.mjs --only=${entry.id})`
  );
}
