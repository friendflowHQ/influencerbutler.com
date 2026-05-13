// Regenerates public/sitemap.xml from the public/**/*.html canonical pages.
// Run via `npm run generate:sitemap` or as a `prebuild` hook.
import { readdir, stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");
const sitemapPath = path.join(publicDir, "sitemap.xml");
const SITE_ORIGIN = "https://www.influencerbutler.com";

// Mirrors the rewrite rules in next.config.ts. Add new public pages here.
const ROOT_PAGES = {
  "index.html": { url: "/", priority: "0.9", changefreq: "weekly" },
  "landing-page.html": { url: "/landing", priority: "0.7", changefreq: "weekly" },
  "email-sequences.html": { url: "/email-sequences", priority: "0.7", changefreq: "weekly" },
};
const LEGAL_DEFAULTS = { priority: "0.3", changefreq: "monthly" };
const FEATURE_DEFAULTS = { priority: "0.7", changefreq: "weekly" };

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

function mapToCanonical(relPath) {
  const posix = relPath.split(path.sep).join("/");
  if (posix in ROOT_PAGES) return ROOT_PAGES[posix];

  const legal = posix.match(/^legal\/(privacy|terms|eula)\.html$/);
  if (legal) return { url: `/legal/${legal[1]}`, ...LEGAL_DEFAULTS };

  const feature = posix.match(/^features\/([^/]+)\.html$/);
  if (feature) return { url: `/features/${feature[1]}`, ...FEATURE_DEFAULTS };

  return null;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const entries = [];
  for await (const file of walk(publicDir)) {
    const rel = path.relative(publicDir, file);
    const meta = mapToCanonical(rel);
    if (!meta) {
      console.log(`  - skipped (no canonical mapping): ${rel}`);
      continue;
    }
    const st = await stat(file);
    entries.push({
      loc: `${SITE_ORIGIN}${meta.url}`,
      lastmod: fmtDate(st.mtime),
      changefreq: meta.changefreq,
      priority: meta.priority,
    });
  }

  entries.sort((a, b) => a.loc.localeCompare(b.loc));

  const body = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  const existing = await readFile(sitemapPath, "utf8").catch(() => "");
  if (existing === xml) {
    console.log(`generate-sitemap: ${entries.length} URLs, no changes`);
    return;
  }
  await writeFile(sitemapPath, xml);
  console.log(`generate-sitemap: wrote ${entries.length} URLs to public/sitemap.xml`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
