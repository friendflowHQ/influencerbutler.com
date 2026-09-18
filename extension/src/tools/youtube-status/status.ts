import {
  sendToBackground,
  type YouTubeStatusResult,
  type YouTubeStatusRecord,
} from "../../shared/messages";

// Resolved YouTube upload status for a batch of Amazon videos, as answered by the
// desktop YouTube Butler over the local bridge. `paired` is false when the app has
// never been connected OR is not running right now (upload status lives only on the
// desktop, so there is no server fallback): the overlay then shows a muted
// "connect the app" chip instead of on/not-on. `byId` holds the uploaded/known
// videos keyed by lowercased contentId; a paired lookup whose contentId is absent
// from the map means "not on YouTube yet".
export type YouTubeStatusLookup = {
  paired: boolean;
  byId: Map<string, YouTubeStatusRecord>;
};

export async function resolveYouTubeStatus(contentIds: string[]): Promise<YouTubeStatusLookup> {
  const want = Array.from(
    new Set((Array.isArray(contentIds) ? contentIds : []).map((c) => String(c || "").trim().toLowerCase()).filter(Boolean)),
  );
  const empty: YouTubeStatusLookup = { paired: false, byId: new Map() };
  if (want.length === 0) return empty;
  let res: YouTubeStatusResult;
  try {
    res = await sendToBackground<YouTubeStatusResult>({ kind: "LOOKUP_YOUTUBE_STATUS", contentIds: want });
  } catch {
    return empty;
  }
  // paired:false is the explicit "never connected" signal; an ok:false result with
  // no paired flag means the app is not answering right now -> also "unknown".
  const paired = res.paired !== false && res.ok === true;
  const byId = new Map<string, YouTubeStatusRecord>();
  for (const r of Array.isArray(res.results) ? res.results : []) {
    const cid = String(r?.contentId || "").trim().toLowerCase();
    if (cid) byId.set(cid, r);
  }
  return { paired, byId };
}
