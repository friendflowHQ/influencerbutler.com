#!/usr/bin/env node
// Writes src/lib/generated/page-last-modified.json: { "/path": "YYYY-MM-DD" } for
// pages edited recently. The admin Growth dashboard's striking-distance panel
// reads it to show "Updated <date>, waiting on Google" instead of re-recommending
// work that is already done (Search Console averages 28 days, so an edit takes
// weeks to show up in position).
//
// Built ahead of time on purpose: reading public/ with fs at request time makes
// Vercel trace the whole folder into the function bundle.
//
// Sources, newest date wins per path:
//   1. JSON-LD "dateModified" in public/**/*.html
//   2. content/blog/_index.json: `updated`, else `date`
//   3. git history (last LOOKBACK_DAYS) for public/**/*.html and content/blog/*.mdx,
//      skipping bulk commits (site-wide injections or cleanups are not content
//      edits). Skipped on shallow clones (Vercel), where history is truncated;
//      the committed file's entries are merged in instead so they survive.
//
// Usage: node scripts/generate-page-lastmod.mjs

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const blogIndexPath = path.join(root, "content", "blog", "_index.json");
const outPath = path.join(root, "src", "lib", "generated", "page-last-modified.json");

const LOOKBACK_DAYS = 120;
// A commit touching more pages than this is treated as a bulk change.
const BULK_COMMIT_FILES = 25;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

const map = new Map();
function bump(urlPath, date) {
  if (!urlPath || typeof date !== "string") return;
  const d = date.slice(0, 10);
  if (!DATE_RE.test(d) || d < cutoff) return;
  const prev = map.get(urlPath);
  if (!prev || d > prev) map.set(urlPath, d);
}

// public/features/foo.html -> /features/foo; public/index.html -> /
function htmlToUrl(relPosix) {
  let p = relPosix.replace(/\.html$/, "");
  if (p === "index") return "/";
  if (p.endsWith("/index")) p = p.slice(0, -"/index".length);
  return `/${p}`;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield full;
  }
}

async function fromJsonLd() {
  for await (const file of walk(publicDir)) {
    const html = await readFile(file, "utf8");
    const rel = path.relative(publicDir, file).split(path.sep).join("/");
    for (const m of html.matchAll(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/g)) {
      bump(htmlToUrl(rel), m[1]);
    }
  }
}

async function fromBlogIndex() {
  try {
    const idx = JSON.parse(await readFile(blogIndexPath, "utf8"));
    for (const post of idx.posts ?? []) {
      if (!post?.id || post.retired) continue;
      bump(`/blog/${post.id}`, post.updated || post.date);
    }
  } catch (err) {
    console.log(`generate-page-lastmod: no blog manifest (${err.code || err.message})`);
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function fileToUrl(file) {
  const html = file.match(/^public\/(.+\.html)$/);
  if (html) return htmlToUrl(html[1]);
  const mdx = file.match(/^content\/blog\/([^/]+?)\.[a-z]{2}-[A-Z]{2}\.mdx$/);
  if (mdx) return `/blog/${mdx[1]}`;
  return null;
}

// Returns false when history is unavailable or truncated.
function fromGit() {
  try {
    if (git(["rev-parse", "--is-shallow-repository"]).trim() !== "false") return false;
    const out = git([
      "log",
      `--since=${LOOKBACK_DAYS}.days`,
      "--no-merges",
      "--format=@@%cs",
      "--name-only",
      "--",
      "public",
      "content/blog",
    ]);
    let skipped = 0;
    for (const chunk of out.split("@@").slice(1)) {
      const [date, ...rest] = chunk.split("\n");
      const urls = new Set(rest.map((f) => fileToUrl(f.trim())).filter(Boolean));
      if (urls.size > BULK_COMMIT_FILES) {
        skipped++;
        continue;
      }
      for (const u of urls) bump(u, date.trim());
    }
    if (skipped) console.log(`generate-page-lastmod: skipped ${skipped} bulk commits`);
    return true;
  } catch (err) {
    console.log(`generate-page-lastmod: git history unavailable (${err.message.split("\n")[0]})`);
    return false;
  }
}

async function mergeExisting() {
  try {
    const prev = JSON.parse(await readFile(outPath, "utf8"));
    for (const [p, d] of Object.entries(prev)) bump(p, d);
  } catch {
    // First run: nothing to merge.
  }
}

async function main() {
  await fromJsonLd();
  await fromBlogIndex();
  if (!fromGit()) await mergeExisting();

  const sorted = Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const json = `${JSON.stringify(sorted, null, 2)}\n`;
  let existing = "";
  try {
    existing = await readFile(outPath, "utf8");
  } catch {
    // missing
  }
  if (existing !== json) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, json);
  }
  console.log(`generate-page-lastmod: ${map.size} pages edited since ${cutoff}`);
}

main().catch((err) => {
  console.error("generate-page-lastmod failed:", err);
  process.exit(1);
});
