/**
 * Summary: Inserts annotated screenshots into Help & Tutorials MDX for every
 *   locale. Input is a placements JSON (array of
 *   { slug, id, anchor, indent }) where `anchor` is the exact en-US MDX line
 *   the image goes after. The en-US anchor is turned into a structural
 *   position (which heading section, then which numbered step / bullet /
 *   paragraph in it), and the same position is used in es-ES and fr-FR, so
 *   translated files get the image in the matching place without matching
 *   translated text. Alt text and captions come from the desktop repo's
 *   tutorials/screens/<slug>.json spec. Idempotent: an image already present
 *   in a file is skipped. Preserves CRLF/LF line endings.
 *
 * Usage:
 *   node scripts/insert-tutorial-shots.mjs placements.json [--locales=en-US,es-ES] [--specs=<dir>] [--dry]
 *   (default specs dir: ../InfluencerButler/tutorials/screens)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TUT = path.join(ROOT, "content", "tutorials");
const localesArg = process.argv.find((a) => a.startsWith("--locales="));
// Default en-US only: token-based section matching misplaces images in
// abridged translations, so es-ES/fr-FR placement is opt-in (or done by hand).
const LOCALES = localesArg ? localesArg.slice(10).split(",") : ["en-US"];
const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const specsArg = argv.find((a) => a.startsWith("--specs="));
const SPECS = specsArg ? specsArg.slice(8) : path.resolve(ROOT, "..", "InfluencerButler", "tutorials", "screens");
const placementsFile = argv.find((a) => !a.startsWith("--"));
if (!placementsFile) {
  console.error("usage: node scripts/insert-tutorial-shots.mjs placements.json [--dry]");
  process.exit(2);
}
const placements = JSON.parse(fs.readFileSync(placementsFile, "utf8"));

const isHeading = (l) => /^#{2,6}\s/.test(l);
function kindOf(line) {
  const num = line.match(/^(\s*)(\d+)\.\s/);
  if (num) return { kind: `num:${num[1].length}`, key: num[2] };
  const bul = line.match(/^(\s*)[-*]\s/);
  if (bul) return { kind: `bul:${bul[1].length}` };
  if (/^\s*$/.test(line) || isHeading(line) || /^\s*!\[/.test(line) || /^@youtube/.test(line)) return null;
  if (/^\s+\S/.test(line)) return { kind: "cont" };
  return { kind: "para" };
}

/** Structural address of line i: section index + kind + ordinal (or step number). */
function addressOf(lines, i) {
  let section = 0;
  let start = 0;
  for (let j = 0; j <= i; j++) if (isHeading(lines[j])) { section += 1; start = j; }
  const k = kindOf(lines[i]);
  if (!k) return null;
  let ord = 0;
  for (let j = start; j <= i; j++) {
    const kj = kindOf(lines[j]);
    if (kj && kj.kind === k.kind && (k.key == null || kj.key === k.key)) ord += 1;
  }
  return { section, kind: k.kind, key: k.key ?? null, ord };
}

// Sections are matched across locales by shared untranslated tokens (code
// spans, numbers, links, capitalized product words), not by index: translated
// files sometimes order or merge sections differently.
function sections(lines) {
  const out = [{ start: 0, end: lines.length - 1 }];
  for (let j = 0; j < lines.length; j++) {
    if (isHeading(lines[j])) { out[out.length - 1].end = j - 1; out.push({ start: j, end: lines.length - 1 }); }
  }
  return out;
}
function tokens(text) {
  const t = new Set();
  for (const m of text.matchAll(/`([^`]+)`/g)) t.add(`c:${m[1]}`);
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) t.add(`u:${m[1]}`);
  for (const m of text.matchAll(/\b\d+(?:[.,]\d+)?%?/g)) t.add(`n:${m[0]}`);
  for (const m of text.matchAll(/\b[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*\b/g)) if (m[0].length > 3) t.add(`w:${m[0]}`);
  return t;
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / Math.min(a.size, b.size);
}
function matchSection(enLines, lines, enSection) {
  const enSecs = sections(enLines);
  const secs = sections(lines);
  if (enSection === 0) return 0;
  // Only tokens that survive translation somewhere in the file can vote.
  const fileTok = tokens(lines.join("\n"));
  const enTok = new Set([...tokens(enLines.slice(enSecs[enSection].start, enSecs[enSection].end + 1).join("\n"))].filter((x) => fileTok.has(x)));
  let best = -1;
  let bestScore = 0;
  secs.forEach((sec, idx) => {
    if (idx === 0) return;
    const secTok = tokens(lines.slice(sec.start, sec.end + 1).join("\n"));
    let inter = 0;
    for (const x of enTok) if (secTok.has(x)) inter += 1;
    let score = enTok.size ? inter / enTok.size : 0;
    if (idx === enSection) score += 0.08; // tie-break toward the same position
    if (score > bestScore) { bestScore = score; best = idx; }
  });
  if (process.env.DEBUG_SHOTS) console.error(`section ${enSection} -> ${best} score ${bestScore.toFixed(2)} (${enTok.size} tokens)`);
  return bestScore >= 0.3 ? best : -1;
}

function findAddress(lines, addr, enLines) {
  const target = enLines ? matchSection(enLines, lines, addr.section) : addr.section;
  if (target < 0) return -1;
  let section = 0;
  let ord = 0;
  let lastOfKind = -1;
  for (let j = 0; j < lines.length; j++) {
    if (isHeading(lines[j])) { section += 1; ord = 0; continue; }
    if (section !== target) continue;
    const k = kindOf(lines[j]);
    if (k && k.kind === addr.kind && (addr.key == null || k.key === addr.key)) {
      ord += 1;
      lastOfKind = j;
      if (ord === addr.ord) return j;
    }
  }
  // A translation may merge paragraphs: fall back to the last block of that kind.
  return addr.key == null ? lastOfKind : -1;
}

/** Last line belonging to the block that starts at i (wrapped continuation lines). */
function blockEnd(lines, i) {
  let j = i;
  while (j + 1 < lines.length && /^\S/.test(lines[j + 1]) && !isHeading(lines[j + 1]) && kindOf(lines[j + 1])?.kind === "para" && kindOf(lines[i])?.kind === "para") j += 1;
  return j;
}

const clean = (s) => String(s || "").replace(/[—–]/g, "-").replace(/"/g, "'").replace(/[\[\]]/g, "");
const specCache = new Map();
function spec(slug) {
  if (!specCache.has(slug)) specCache.set(slug, JSON.parse(fs.readFileSync(path.join(SPECS, `${slug}.json`), "utf8")));
  return specCache.get(slug);
}

let inserted = 0;
const warnings = [];
const bySlug = new Map();
for (const p of placements) {
  if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
  bySlug.get(p.slug).push(p);
}

for (const [slug, list] of bySlug) {
  const enPath = path.join(TUT, `${slug}.en-US.mdx`);
  const enLines = fs.readFileSync(enPath, "utf8").split(/\r?\n/);
  const addrs = [];
  for (const p of list) {
    const i = enLines.findIndex((l) => l.trimEnd() === p.anchor.trimEnd());
    if (i < 0) { warnings.push(`${slug}/${p.id}: anchor not found in en-US`); continue; }
    const a = addressOf(enLines, i);
    if (!a) { warnings.push(`${slug}/${p.id}: anchor is not a text block`); continue; }
    addrs.push({ p, a });
  }

  for (const locale of LOCALES) {
    const file = path.join(TUT, `${slug}.${locale}.mdx`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);
    // Insert bottom-up so earlier indexes stay valid.
    const ops = [];
    for (const { p, a } of addrs) {
      const shot = (spec(slug).shots || []).find((s) => s.id === p.id);
      if (!shot) { warnings.push(`${slug}/${p.id}: no such shot in spec`); continue; }
      const src = `/assets/tutorials/${slug}/{locale}/${p.id}.webp`;
      if (raw.includes(`/${slug}/{locale}/${p.id}.webp`)) continue;
      const at = locale === "en-US" ? findAddress(lines, a) : findAddress(lines, a, enLines);
      if (at < 0) { warnings.push(`${slug}/${p.id}: no matching position in ${locale}`); continue; }
      const end = blockEnd(lines, at);
      const alt = clean(shot.alt?.[locale] || shot.alt?.["en-US"] || "");
      const cap = clean(shot.caption?.[locale] || shot.caption?.["en-US"] || "");
      // Indent to the list item's text column so the renderer attaches the
      // figure to that item ("1. " -> 3 spaces, "   - " -> 5).
      const marker = lines[at].match(/^(\s*)(\d+\.|[-*])\s+/);
      const lead = p.indent && marker ? " ".repeat(marker[0].length) : "";
      const img = `${lead}![${alt}](${src}${cap ? ` "${cap}"` : ""})`;
      ops.push({ after: end, seq: ops.length, text: p.indent ? [img] : ["", img] });
    }
    // Bottom-up; several shots on one anchor keep their order (last spliced first).
    ops.sort((x, y) => y.after - x.after || y.seq - x.seq);
    for (const op of ops) {
      // A paragraph-level image needs a blank line after it too.
      const next = lines[op.after + 1];
      const text = !op.text[0] && next !== undefined && next.trim() !== "" ? [...op.text, ""] : op.text;
      lines.splice(op.after + 1, 0, ...text);
      inserted += 1;
    }
    if (ops.length && !dry) fs.writeFileSync(file, lines.join(eol));
    if (ops.length) console.log(`${dry ? "would insert" : "inserted"} ${ops.length} into ${slug}.${locale}.mdx`);
  }
}
for (const w of warnings) console.warn(`WARN ${w}`);
console.log(`${inserted} image line(s) ${dry ? "planned" : "inserted"}, ${warnings.length} warning(s)`);
