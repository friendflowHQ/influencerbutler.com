/**
 * Summary: Re-syncs the alt text and caption of every annotated screenshot line
 *   in content/tutorials/*.mdx from the desktop repo's spec
 *   (InfluencerButler/tutorials/screens/<slug>.json), per locale. Run after
 *   editing a spec's alt/caption so all three locales' MDX stay in step with
 *   the images. Only lines of the form
 *     ![alt](/assets/tutorials/<slug>/{locale}/<id>.webp "caption")
 *   are touched. Preserves indentation and line endings.
 * Usage: node scripts/sync-tutorial-shot-text.mjs [--specs=<dir>] [--dry]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TUT = path.join(ROOT, "content", "tutorials");
const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const specsArg = argv.find((a) => a.startsWith("--specs="));
const SPECS = specsArg ? specsArg.slice(8) : path.resolve(ROOT, "..", "InfluencerButler", "tutorials", "screens");
const clean = (s) => String(s || "").replace(/[—–]/g, "-").replace(/"/g, "'").replace(/[[\]]/g, "");

const specs = new Map();
const spec = (slug) => {
  if (!specs.has(slug)) {
    const p = path.join(SPECS, `${slug}.json`);
    specs.set(slug, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
  }
  return specs.get(slug);
};

let changed = 0;
const LINE = /^(\s*)!\[[^\]]*\]\((\/assets\/tutorials\/([a-z0-9-]+)\/\{locale\}\/([a-z0-9-]+)\.webp)(?:\s+"[^"]*")?\)\s*$/i;
for (const file of fs.readdirSync(TUT).filter((f) => f.endsWith(".mdx"))) {
  const locale = (file.match(/\.([a-z]{2}-[A-Z]{2})\.mdx$/) || [])[1] || "en-US";
  const p = path.join(TUT, file);
  const raw = fs.readFileSync(p, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let n = 0;
  const lines = raw.split(/\r?\n/).map((line) => {
    const m = line.match(LINE);
    if (!m) return line;
    const [, lead, src, slug, id] = m;
    const shot = (spec(slug)?.shots || []).find((s) => s.id === id);
    if (!shot) return line;
    const alt = clean(shot.alt?.[locale] || shot.alt?.["en-US"]);
    const cap = clean(shot.caption?.[locale] || shot.caption?.["en-US"]);
    const next = `${lead}![${alt}](${src}${cap ? ` "${cap}"` : ""})`;
    if (next !== line) n += 1;
    return next;
  });
  if (n) {
    changed += n;
    console.log(`${dry ? "would update" : "updated"} ${n} line(s) in ${file}`);
    if (!dry) fs.writeFileSync(p, lines.join(eol));
  }
}
console.log(`${changed} screenshot line(s) ${dry ? "to update" : "updated"}`);
