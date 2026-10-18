// Shared builders for the walkthrough-video surfaces. Imported by
// scripts/inject-feature-videos.mjs (static HTML) and src/lib/video-catalog.ts
// (the /videos routes) so the markup and JSON-LD cannot drift apart.

export const SITE_ORIGIN = "https://www.influencerbutler.com";
export const LOGO_URL = `${SITE_ORIGIN}/assets/influencer-butler-logo.png`;

export const PUBLISHER = {
  "@type": "Organization",
  name: "Influencer Butler",
  logo: { "@type": "ImageObject", url: LOGO_URL },
};

/** @param {number} seconds */
export function isoDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  let out = "PT";
  if (h) out += `${h}H`;
  if (m) out += `${m}M`;
  if (s || (!h && !m)) out += `${s}S`;
  return out;
}

/** Human label for a heading: "2-minute". */
export function minutesLabel(seconds) {
  const m = Math.max(1, Math.round((Number(seconds) || 0) / 60));
  return `${m}-minute`;
}

/** @param {string} s */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function embedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&cc_load_policy=1`;
}

export function videoPageUrl(video) {
  return `${SITE_ORIGIN}/videos/${video.slug}`;
}

/**
 * schema.org VideoObject for one catalog entry on one page.
 * @param {{videoId:string,title:string,description?:string,thumbnailUrl:string,publishedAt?:string|null,seconds:number,embedUrl:string}} video
 * @param {string} pageUrl absolute URL of the page carrying the embed
 */
export function videoObject(video, pageUrl) {
  const obj = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${pageUrl}#video-${video.videoId}`,
    name: video.title,
    description: video.description || video.title,
    thumbnailUrl: [video.thumbnailUrl, `https://i.ytimg.com/vi/${video.videoId}/maxresdefault.jpg`],
    duration: isoDuration(video.seconds),
    embedUrl: video.embedUrl,
    contentUrl: watchUrl(video.videoId),
    publisher: PUBLISHER,
    isPartOf: { "@id": pageUrl },
  };
  if (video.publishedAt) obj.uploadDate = video.publishedAt;
  return obj;
}

/** Serialise JSON-LD safely inside a <script> element. */
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export function jsonLdScript(obj) {
  return `<script type="application/ld+json">${jsonLd(obj)}</script>`;
}

/** The lazy, privacy-mode iframe used everywhere on the site. */
export function iframeHtml(video) {
  return (
    `<iframe src="${embedUrl(video.videoId)}" title="Video: ${escapeHtml(video.title)}" loading="lazy" ` +
    `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
  );
}

/**
 * Collapsed text alternative under an embed (WCAG 1.2). Returns "" when there
 * is no transcript so callers never ship an empty disclosure.
 * @param {{language?:string,paragraphs:{heading?:string,text:string}[]}|undefined} transcript
 * @param {string} className
 */
export function transcriptHtml(transcript, className = "feature-video-transcript") {
  if (!transcript || !Array.isArray(transcript.paragraphs) || !transcript.paragraphs.length) return "";
  const paras = transcript.paragraphs
    .map((p) => {
      const heading = (p.heading || "").trim();
      const text = escapeHtml((p.text || "").trim());
      return heading ? `<p><strong>${escapeHtml(heading)}.</strong> ${text}</p>` : `<p>${text}</p>`;
    })
    .join("");
  return (
    `<details class="${className}" lang="${escapeHtml(transcript.language || "en")}">` +
    `<summary>Read the video transcript</summary><div class="${className}-body">${paras}</div></details>`
  );
}
