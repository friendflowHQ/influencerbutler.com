// Adds a few contextual links (feature pages, free tools, guides, the extension)
// to the body of every English blog post, based on content/blog/_link-targets.json.
//
//   node scripts/link-blog-posts.mjs            dry run: prints what would change
//   node scripts/link-blog-posts.mjs --write    applies the changes
//   node scripts/link-blog-posts.mjs --only=slug-one,slug-two
//   node scripts/link-blog-posts.mjs --max=3    max new links per post (default 3)
//
// Idempotent: a target the post already links to is skipped, so re-running after a
// new post lands only touches that post. Frontmatter is never modified. Only the
// en-US files are touched; the runtime "Tools and guides" block under every post
// (src/lib/blog-links.ts) covers es-ES and fr-FR.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyInlineLinks } from "./lib/blog-inline-links.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const blogDir = path.join(here, "..", "content", "blog");

const args = process.argv.slice(2);
const write = args.includes("--write");
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const maxArg = args.find((a) => a.startsWith("--max="));
const maxLinks = maxArg ? Math.max(0, parseInt(maxArg.slice(6), 10) || 3) : 3;

function splitFrontmatter(raw) {
  const m = raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  if (!m) return { head: "", body: raw };
  return { head: m[1], body: m[2] };
}

const targets = JSON.parse(await readFile(path.join(blogDir, "_link-targets.json"), "utf8")).targets;
const files = (await readdir(blogDir)).filter((f) => f.endsWith(".en-US.mdx")).sort();

let touched = 0;
let totalAdded = 0;
const perHref = {};

for (const file of files) {
  const slug = file.replace(/\.en-US\.mdx$/, "");
  if (only.length && !only.includes(slug)) continue;

  const raw = await readFile(path.join(blogDir, file), "utf8");
  // Preserve the file's own line endings.
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const { head, body } = splitFrontmatter(raw);
  const category = (head.match(/^category:[ \t]*(.+)$/m) ?? [])[1] ?? "";
  const normalized = body.replace(/\r\n/g, "\n");
  const result = applyInlineLinks(normalized, targets, { maxLinks, category: category.trim() });
  if (result.added.length === 0) continue;

  touched++;
  totalAdded += result.added.length;
  for (const a of result.added) perHref[a.href] = (perHref[a.href] ?? 0) + 1;
  console.log(`${slug}: ${result.added.map((a) => `"${a.text}" -> ${a.href}`).join("; ")}`);

  if (write) {
    await writeFile(path.join(blogDir, file), head + result.body.replace(/\n/g, eol), "utf8");
  }
}

console.log(
  `\n${write ? "Updated" : "Would update"} ${touched} of ${files.length} posts, ${totalAdded} links added.`,
);
const top = Object.entries(perHref).sort((a, b) => b[1] - a[1]);
for (const [href, n] of top) console.log(`  ${String(n).padStart(3)}  ${href}`);
if (!write) console.log("\nDry run only. Re-run with --write to apply.");
