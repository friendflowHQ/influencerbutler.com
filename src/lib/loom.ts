// Resolve a Loom share link to a direct, downloadable MP4 URL.
//
// Loom exposes a per-session "transcoded-url" endpoint that returns a signed CDN
// URL to the finished MP4. We use it so an event recording captured in Loom can
// be streamed straight into the YouTube upload pipeline (src/lib/youtube.ts),
// exactly like a Recall recording URL, without downloading the whole file first.
//
// The signed URL is time-limited (a few hours), so resolve it immediately before
// the upload, not ahead of time. Undocumented endpoint: treat any failure as
// "could not resolve" and let the caller fall back to a directly-supplied URL.

/** Extract a Loom session id from a share URL or a bare id. Returns null if none. */
export function loomSessionId(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  // Bare 32-hex id.
  if (/^[0-9a-f]{20,}$/i.test(s)) return s;
  // https://www.loom.com/share/<id>?... (also /embed/<id>)
  const m = s.match(/loom\.com\/(?:share|embed)\/([0-9a-f]+)/i);
  return m ? m[1] : null;
}

/** True for a URL that is already a direct Loom CDN MP4 (no resolution needed). */
export function isLoomCdnUrl(url: string): boolean {
  return /^https:\/\/cdn\.loom\.com\/.+\.mp4/i.test((url || "").trim());
}

/**
 * Given a Loom share URL/id, return the signed MP4 download URL, or null on any
 * failure. Best-effort; never throws.
 */
export async function resolveLoomMp4Url(shareUrlOrId: string): Promise<string | null> {
  const id = loomSessionId(shareUrlOrId);
  if (!id) return null;
  try {
    const res = await fetch(`https://www.loom.com/api/campaigns/sessions/${id}/transcoded-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.error("[loom] transcoded-url", res.status);
      return null;
    }
    const json = (await res.json()) as { url?: string };
    return json.url || null;
  } catch (e) {
    console.error("[loom] resolveLoomMp4Url threw", e);
    return null;
  }
}
