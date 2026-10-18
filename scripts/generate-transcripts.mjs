// Syncs the website's walkthrough-video data from the desktop app repo:
//
//   content/tutorials/_videos.json        tutorial slug -> primary videoId (auto-embedded at the top of the help page)
//   content/tutorials/_transcripts.json   videoId -> spoken transcript (WCAG 1.2 media alternative)
//   content/tutorials/_video-catalog.json every public video with title, duration, group, surfaces (feeds /videos and the feature-page injector)
//
// Sources, all read-only:
//   <desktop>/workspaces/help/help-videos.json   which upload is current per tool (buckets: videos, general, promo), visibility, unavailable flag, retired ids
//   <desktop>/tutorials/scripts/<tool>.json      the narration beats (the spoken words, so joining them is an exact transcript)
//   <desktop>/tutorials/out/<tool>/<tool>.youtube-id.json and .youtube.json   videoId -> tool fallback, and the published description
//   content/tutorials/_video-aliases.json        hand-maintained desktop key -> site slug / feature page / extra pages
//   content/tutorials/_transcripts.manual.json   hand-written transcripts for videos the factory never produced
//
// Rules enforced here (CLAUDE.md): every embedded video has a transcript; every @youtube marker appears
// in all three locales of its tutorial; only public, available uploads reach the site; a desktop key the
// site cannot place is reported instead of silently dropped.
//
// Run `node scripts/generate-transcripts.mjs` (alias: npm run sync:videos) after publishing walkthroughs.
// `--strict` exits 1 when anything is unresolved (open decisions, missing transcripts, locale mismatches).
// Set IB_APP_REPO_PATH if the desktop repo is not the sibling `InfluencerButler` folder.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const contentDir = path.join(repoRoot, "content", "tutorials");
const featuresDir = path.join(repoRoot, "public", "features");
const appRepo =
  process.env.IB_APP_REPO_PATH || path.resolve(repoRoot, "..", "InfluencerButler");

const STRICT = process.argv.includes("--strict");
const LOCALES = ["en-US", "es-ES", "fr-FR"];
const BUCKETS = ["videos", "general", "promo"];
const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const MARKER_RE = /^@youtube\(([A-Za-z0-9_-]{6,20})\)\s*$/gm;

const videosPath = path.join(contentDir, "_videos.json");
const transcriptsPath = path.join(contentDir, "_transcripts.json");
const catalogPath = path.join(contentDir, "_video-catalog.json");
const aliasesPath = path.join(contentDir, "_video-aliases.json");
const manualPath = path.join(contentDir, "_transcripts.manual.json");
const indexPath = path.join(contentDir, "_index.json");

const warnings = [];
const info = [];
const warn = (m) => warnings.push(m);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

function dashless(s) {
  return String(s).replace(/-/g, "");
}

function asList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Retired uploads: `previous` is a videoId string, an object, or a list of either.
function previousIds(entry) {
  return asList(entry.previous)
    .map((p) => (typeof p === "string" ? p : p && p.videoId))
    .filter((id) => id && YT_ID.test(id));
}

// Group fallback when the alias table does not say: key prefix first, then the
// tutorial's category in _index.json.
function inferGroup(key, category) {
  if (/^benable/.test(key)) return "Benable";
  if (/walmart/.test(key)) return "Walmart";
  if (/^levanta/.test(key)) return "Levanta";
  if (/^(facebook|group-invite|group-uninvite|delete-posts)/.test(key)) return "Facebook";
  if (/^(instagram|closefriends|close-friends)/.test(key)) return "Instagram";
  if (/^(cc-|campaign-alert|harvest)/.test(key)) return "Creator Connections";
  if (/deals|black-friday|prime-day|pricecrash|expired/.test(key)) return "Deals";
  if (category === "Getting Started") return "Getting started";
  if (category === "Amazon") return "Amazon";
  if (category === "Instagram") return "Instagram";
  return "More tools";
}

function firstParagraph(text, max = 200) {
  const para = String(text || "")
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, " ")
    .trim();
  if (para.length <= max) return para;
  const cut = para.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 120)).trim() + "...";
}

async function transcriptFromScript(scriptPath) {
  if (!scriptPath || !existsSync(scriptPath)) return null;
  const script = await readJson(scriptPath);
  const paragraphs = [];
  for (const beat of script.beats || []) {
    const text = (beat.narration || "").trim();
    if (!text) continue;
    paragraphs.push({ heading: (beat.caption || "").trim(), text });
  }
  if (!paragraphs.length) return null;
  return {
    tool: script.toolId || path.basename(scriptPath, ".json"),
    title: (script.youtube && script.youtube.title) || script.title || "",
    language: "en",
    paragraphs,
  };
}

async function main() {
  if (!existsSync(appRepo)) {
    console.error(`Desktop repo not found at ${appRepo}; set IB_APP_REPO_PATH.`);
    process.exit(1);
  }

  const manifest = await readJson(path.join(appRepo, "workspaces", "help", "help-videos.json"));
  const aliases = await readJson(aliasesPath, { groups: [], keys: {} });
  const manual = await readJson(manualPath, { transcripts: {} });
  const videosDoc = await readJson(videosPath, { videos: {} });
  const videos = videosDoc.videos || {};
  const index = await readJson(indexPath, { tutorials: [] });
  const categoryBySlug = new Map(
    (index.tutorials || []).map((t) => [t.id, t.category || ""]),
  );

  // Site tutorial slugs, from the en-US files (every tutorial has one).
  const slugs = new Set();
  const mdxFiles = (await readdir(contentDir)).filter((f) => f.endsWith(".mdx"));
  for (const f of mdxFiles) {
    const m = f.match(/^(.+)\.en-US\.mdx$/);
    if (m) slugs.add(m[1]);
  }
  const slugByDashless = new Map([...slugs].map((s) => [dashless(s), s]));
  const featureExists = (slug) => !!slug && existsSync(path.join(featuresDir, `${slug}.html`));

  // 1) Walk every manifest bucket.
  const entries = []; // { key, bucket, entry }
  const retired = new Set();
  const unavailable = new Set();
  const keysByVideoId = new Map();
  for (const bucket of BUCKETS) {
    for (const [key, entry] of Object.entries(manifest[bucket] || {})) {
      if (!entry || typeof entry !== "object" || !entry.videoId) continue;
      entries.push({ key, bucket, entry });
      for (const id of previousIds(entry)) retired.add(id);
      if (entry.unavailable) unavailable.add(entry.videoId);
      if (!keysByVideoId.has(entry.videoId)) keysByVideoId.set(entry.videoId, []);
      keysByVideoId.get(entry.videoId).push(key);
    }
  }

  // 2) Resolve each key to its site surfaces.
  const heldBack = [];
  const unresolved = [];
  const resolved = []; // { key, bucket, entry, tutorials[], feature, pages[], group, primary }
  const seenVideoIds = new Set();
  for (const { key, bucket, entry } of entries) {
    const alias = (aliases.keys || {})[key] || {};
    if (alias.sameAs) {
      const target = entries.find((e) => e.key === alias.sameAs);
      if (target && target.entry.videoId !== entry.videoId) {
        warn(`${key} is marked sameAs ${alias.sameAs} but the ids differ (${entry.videoId} vs ${target.entry.videoId})`);
      }
      continue;
    }
    if (alias.skip) {
      heldBack.push(`${key} (skip: ${alias.skip})`);
      continue;
    }
    if (entry.unavailable) {
      heldBack.push(`${key} (unavailable on YouTube)`);
      continue;
    }
    if ((entry.visibility || "public") !== "public") {
      heldBack.push(`${key} (${entry.visibility})`);
      continue;
    }
    if (alias.needsDecision) {
      unresolved.push(`${key} ${entry.videoId}: ${alias.needsDecision}`);
      continue;
    }
    if (seenVideoIds.has(entry.videoId)) {
      info.push(`${key} shares ${entry.videoId} with ${keysByVideoId.get(entry.videoId).join(", ")}; kept the first`);
      continue;
    }

    let tutorials;
    if ("tutorial" in alias) {
      tutorials = alias.tutorial === null ? [] : asList(alias.tutorial);
    } else if (slugs.has(key)) {
      tutorials = [key];
    } else if (slugByDashless.has(dashless(key))) {
      tutorials = [slugByDashless.get(dashless(key))];
    } else {
      unresolved.push(`${key} ${entry.videoId}: no tutorial slug matches; add it to _video-aliases.json`);
      continue;
    }
    const missingSlugs = tutorials.filter((s) => !slugs.has(s));
    if (missingSlugs.length) {
      unresolved.push(`${key}: alias points at unknown tutorial(s) ${missingSlugs.join(", ")}`);
      continue;
    }

    let feature = null;
    if ("feature" in alias) {
      feature = alias.feature;
      if (feature && !featureExists(feature)) {
        warn(`${key}: alias feature page public/features/${feature}.html does not exist; ignoring`);
        feature = null;
      }
    } else if (tutorials.length && featureExists(tutorials[0])) {
      feature = tutorials[0];
    }

    const category = tutorials.length ? categoryBySlug.get(tutorials[0]) || "" : "";
    const group = alias.group || (bucket === "promo" ? "Promo" : inferGroup(key, category));
    seenVideoIds.add(entry.videoId);
    resolved.push({
      key,
      bucket,
      entry,
      tutorials,
      feature,
      pages: asList(alias.pages),
      group,
      primary: alias.primary !== false,
      featureRank: Number.isFinite(alias.featureRank) ? alias.featureRank : 100,
    });
  }

  // 3) _videos.json: set/refresh primaries, drop dead ids.
  const assigned = new Map(); // slug -> key
  let added = 0;
  let refreshed = 0;
  let removed = 0;
  for (const r of resolved) {
    if (!r.primary) continue;
    for (const slug of r.tutorials) {
      if (assigned.has(slug) && videos[slug] !== r.entry.videoId) {
        warn(`${slug} already gets its primary video from ${assigned.get(slug)}; ${r.key} would also claim it (mark one primary:false)`);
        continue;
      }
      assigned.set(slug, r.key);
      if (!videos[slug]) {
        info.push(`add ${slug}: ${r.entry.videoId} (${r.key})`);
        videos[slug] = r.entry.videoId;
        added += 1;
      } else if (videos[slug] !== r.entry.videoId) {
        info.push(`refresh ${slug}: ${videos[slug]} -> ${r.entry.videoId} (${r.key})`);
        videos[slug] = r.entry.videoId;
        refreshed += 1;
      }
    }
  }
  for (const [slug, id] of Object.entries(videos)) {
    if (unavailable.has(id) || retired.has(id)) {
      info.push(`remove ${slug}: ${id} is ${unavailable.has(id) ? "unavailable" : "retired"}`);
      delete videos[slug];
      removed += 1;
    } else if (!slugs.has(slug)) {
      warn(`_videos.json entry ${slug} has no tutorial file`);
    }
  }
  const sortedVideos = Object.fromEntries(
    Object.entries(videos).sort(([a], [b]) => a.localeCompare(b)),
  );

  // 4) videoId -> tool fallback from the per-tool id files (older uploads
  //    and hand-recorded videos live only here).
  const outDir = path.join(appRepo, "tutorials", "out");
  const vidToTool = new Map();
  for (const folder of await readdir(outDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const idFile = path.join(outDir, folder.name, `${folder.name}.youtube-id.json`);
    if (!existsSync(idFile)) continue;
    try {
      const d = await readJson(idFile);
      if (d.videoId && d.tool && !vidToTool.has(d.videoId)) vidToTool.set(d.videoId, d.tool);
    } catch {
      // Malformed metadata: the video just will not get a transcript from here.
    }
  }
  const scriptFor = (tool) => path.join(appRepo, "tutorials", "scripts", `${tool}.json`);

  // 5) Transcripts: manifest key's own script first, then any key sharing the
  //    id, then the id-file tool, then the manual file.
  const transcripts = {};
  const manualTranscripts = (manual && manual.transcripts) || {};
  async function resolveTranscript(videoId, hintKeys) {
    if (transcripts[videoId]) return transcripts[videoId];
    const candidates = [
      ...new Set(
        [...(hintKeys || []), ...(keysByVideoId.get(videoId) || []), vidToTool.get(videoId)].filter(
          Boolean,
        ),
      ),
    ];
    for (const tool of candidates) {
      const t = await transcriptFromScript(scriptFor(tool));
      if (t) {
        transcripts[videoId] = t;
        return t;
      }
    }
    const m = manualTranscripts[videoId];
    if (m && Array.isArray(m.paragraphs) && m.paragraphs.length) {
      transcripts[videoId] = { ...m, language: m.language || "en", source: "manual" };
      return transcripts[videoId];
    }
    return null;
  }

  // 6) Catalog.
  const groupsOrder = Array.isArray(aliases.groups) ? aliases.groups : [];
  const catalog = [];
  for (const r of resolved) {
    const t = await resolveTranscript(r.entry.videoId, [r.key]);
    let description = "";
    const ytMetaPath = path.join(outDir, r.key, `${r.key}.youtube.json`);
    if (existsSync(ytMetaPath)) {
      const meta = await readJson(ytMetaPath, {});
      description = firstParagraph(meta.description);
    }
    if (!description && t) description = firstParagraph(t.paragraphs[0].text);
    catalog.push({
      slug: r.key,
      videoId: r.entry.videoId,
      title: r.entry.title || (t && t.title) || r.key,
      description,
      seconds: Number(r.entry.seconds) || 0,
      publishedAt: r.entry.publishedAt || null,
      group: r.group,
      tutorialSlugs: r.tutorials,
      featureSlug: r.feature,
      featureRank: r.featureRank,
      pages: r.pages,
      thumbnailUrl: `https://i.ytimg.com/vi/${r.entry.videoId}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${r.entry.videoId}`,
      hasTranscript: !!t,
    });
    if (!t) warn(`no transcript for ${r.key} (${r.entry.videoId})`);
  }
  const rank = (g) => {
    const i = groupsOrder.indexOf(g);
    return i === -1 ? groupsOrder.length : i;
  };
  catalog.sort((a, b) => rank(a.group) - rank(b.group) || a.title.localeCompare(b.title));

  // 7) Inline @youtube markers: transcripts, locale parity, retired ids.
  const markersBySlug = new Map();
  for (const f of mdxFiles) {
    const m = f.match(/^(.+)\.(en-US|es-ES|fr-FR)\.mdx$/);
    if (!m) continue;
    const raw = await readFile(path.join(contentDir, f), "utf8");
    const ids = [...raw.matchAll(MARKER_RE)].map((x) => x[1]);
    if (!markersBySlug.has(m[1])) markersBySlug.set(m[1], {});
    markersBySlug.get(m[1])[m[2]] = ids;
  }
  for (const [slug, byLocale] of markersBySlug) {
    const all = new Set(LOCALES.flatMap((l) => byLocale[l] || []));
    for (const id of all) {
      const missingLocales = LOCALES.filter((l) => !(byLocale[l] || []).includes(id));
      if (missingLocales.length) {
        warn(`${slug}: @youtube(${id}) is missing from ${missingLocales.join(", ")}`);
      }
      if (retired.has(id)) warn(`${slug}: @youtube(${id}) is a retired upload`);
      if (unavailable.has(id)) warn(`${slug}: @youtube(${id}) is unavailable on YouTube`);
      if (!(await resolveTranscript(id))) {
        warn(`${slug}: no transcript for inline @youtube(${id}); add one to _transcripts.manual.json`);
      }
    }
  }
  for (const [slug, id] of Object.entries(sortedVideos)) {
    if (!transcripts[id]) await resolveTranscript(id);
    if (!transcripts[id]) warn(`${slug}: no transcript for primary video ${id}`);
  }

  // 8) Write.
  const sortedTranscripts = Object.fromEntries(
    Object.entries(transcripts).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(
    transcriptsPath,
    JSON.stringify(
      {
        _note:
          "YouTube videoId -> spoken transcript of the walkthrough. Generated by scripts/generate-transcripts.mjs from the desktop repo's tutorials/scripts/*.json narration beats, merged with _transcripts.manual.json for hand-recorded videos. Do not hand-edit; regenerate when walkthroughs change.",
        transcripts: sortedTranscripts,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeFile(
    videosPath,
    JSON.stringify({ ...videosDoc, videos: sortedVideos }, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        _note:
          "Generated by scripts/generate-transcripts.mjs from the desktop repo's help-videos.json plus _video-aliases.json. Do not hand-edit. Only public, available videos the site can place appear here.",
        generatedAt: new Date().toISOString(),
        groups: [...new Set([...groupsOrder, ...catalog.map((v) => v.group)])],
        videos: catalog,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  for (const line of info) console.log(line);
  console.log(
    `sync: ${catalog.length} public videos in catalog, ${Object.keys(sortedVideos).length} primaries in _videos.json ` +
      `(${added} added, ${refreshed} refreshed, ${removed} removed), ${Object.keys(sortedTranscripts).length} transcripts`,
  );
  if (heldBack.length) console.log(`held back (${heldBack.length}): ${heldBack.join("; ")}`);
  if (unresolved.length) console.warn(`unresolved (${unresolved.length}):\n  ${unresolved.join("\n  ")}`);
  if (warnings.length) console.warn(`warnings (${warnings.length}):\n  ${warnings.join("\n  ")}`);
  if (STRICT && (unresolved.length || warnings.length)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
