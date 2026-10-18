import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isoDuration, videoObject } from "../../../scripts/lib/video-jsonld.mjs";

// Guards the generated video data the public pages depend on. The files are
// produced by scripts/generate-transcripts.mjs; this test fails when a commit
// ships a catalog entry without a transcript, a dangling slug, an embed that is
// missing from a locale, or an em dash in the generated text.

const root = path.resolve(__dirname, "..", "..", "..");
const content = path.join(root, "content", "tutorials");
const LOCALES = ["en-US", "es-ES", "fr-FR"];
const MARKER = /^@youtube\(([A-Za-z0-9_-]{6,20})\)\s*$/gm;

const catalog = JSON.parse(readFileSync(path.join(content, "_video-catalog.json"), "utf8")) as {
  groups: string[];
  videos: {
    slug: string;
    videoId: string;
    title: string;
    seconds: number;
    group: string;
    tutorialSlugs: string[];
    featureSlug: string | null;
    pages: string[];
    hasTranscript: boolean;
  }[];
};
const transcripts = JSON.parse(readFileSync(path.join(content, "_transcripts.json"), "utf8")).transcripts as Record<
  string,
  { paragraphs: { text: string }[] }
>;
const videos = JSON.parse(readFileSync(path.join(content, "_videos.json"), "utf8")).videos as Record<string, string>;

const mdxFiles = readdirSync(content).filter((f) => f.endsWith(".mdx"));
const slugs = new Set(mdxFiles.filter((f) => f.endsWith(".en-US.mdx")).map((f) => f.replace(/\.en-US\.mdx$/, "")));

describe("video catalog", () => {
  it("has unique slugs and video ids", () => {
    const slugSet = new Set(catalog.videos.map((v) => v.slug));
    const idSet = new Set(catalog.videos.map((v) => v.videoId));
    expect(slugSet.size).toBe(catalog.videos.length);
    expect(idSet.size).toBe(catalog.videos.length);
    expect(catalog.videos.length).toBeGreaterThan(30);
  });

  it("points every tutorial slug at a tutorial that exists in all three locales", () => {
    for (const v of catalog.videos) {
      for (const slug of v.tutorialSlugs) {
        for (const l of LOCALES) {
          expect(existsSync(path.join(content, `${slug}.${l}.mdx`)), `${v.slug}: ${slug}.${l}.mdx`).toBe(true);
        }
      }
    }
  });

  it("points every feature slug at a real feature page", () => {
    for (const v of catalog.videos) {
      if (!v.featureSlug) continue;
      expect(existsSync(path.join(root, "public", "features", `${v.featureSlug}.html`)), v.slug).toBe(true);
    }
  });

  it("has a transcript for every catalog video and every primary video", () => {
    for (const v of catalog.videos) {
      expect(v.hasTranscript, v.slug).toBe(true);
      expect(transcripts[v.videoId]?.paragraphs?.length, v.slug).toBeGreaterThan(0);
    }
    for (const [slug, id] of Object.entries(videos)) {
      expect(slugs.has(slug), `_videos.json slug ${slug}`).toBe(true);
      expect(transcripts[id]?.paragraphs?.length, `${slug} ${id}`).toBeGreaterThan(0);
    }
  });

  it("keeps every inline @youtube marker in all three locales of its tutorial", () => {
    const bySlug = new Map<string, Record<string, string[]>>();
    for (const f of mdxFiles) {
      const m = f.match(/^(.+)\.(en-US|es-ES|fr-FR)\.mdx$/);
      if (!m) continue;
      const ids = [...readFileSync(path.join(content, f), "utf8").matchAll(MARKER)].map((x) => x[1]);
      if (!bySlug.has(m[1])) bySlug.set(m[1], {});
      bySlug.get(m[1])![m[2]] = ids;
    }
    for (const [slug, byLocale] of bySlug) {
      const all = new Set(LOCALES.flatMap((l) => byLocale[l] || []));
      for (const id of all) {
        for (const l of LOCALES) {
          expect((byLocale[l] || []).includes(id), `${slug}: ${id} missing from ${l}`).toBe(true);
        }
      }
    }
  });

  it("contains no em dashes in generated text", () => {
    const blob = JSON.stringify(catalog) + JSON.stringify(transcripts);
    expect(blob.includes("—")).toBe(false);
  });

  it("builds valid JSON-LD", () => {
    expect(isoDuration(151)).toBe("PT2M31S");
    expect(isoDuration(0)).toBe("PT0S");
    const v = catalog.videos[0];
    const obj = videoObject(
      { ...v, description: "d", thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`, embedUrl: "e", publishedAt: "2026-10-17T00:00:00.000Z" },
      "https://www.influencerbutler.com/videos/x",
    );
    expect(obj["@type"]).toBe("VideoObject");
    expect(obj.contentUrl).toContain(v.videoId);
    expect((obj as { uploadDate?: string }).uploadDate).toBe("2026-10-17T00:00:00.000Z");
  });
});

describe("injected feature-page blocks", () => {
  it("every feature page that should carry a video has exactly one block with VideoObject JSON-LD", () => {
    const features = new Set(catalog.videos.map((v) => v.featureSlug).filter(Boolean) as string[]);
    for (const slug of features) {
      const html = readFileSync(path.join(root, "public", "features", `${slug}.html`), "utf8");
      expect(html.match(/<!-- ib-video:start -->/g)?.length, slug).toBe(1);
      expect(html.includes('"@type":"VideoObject"'), slug).toBe(true);
      expect(html.includes("—"), `${slug} em dash`).toBe(false);
    }
  });
});
