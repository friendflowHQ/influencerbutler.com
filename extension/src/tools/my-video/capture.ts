import {
  contentIdFromVseId,
  readManageContentRows,
  readManageRows,
  readUploadState,
} from "../../amazon/creator-hub";
import { log } from "../../shared/log";
import { rememberOwnVideos, type OwnVideoRecord, type OwnVideoSource } from "./own-videos";

// Remember the creator's own video ids as they browse the surfaces where a video
// is unambiguously theirs. Passive and free: every reader here is one the
// extension already runs on these pages, and nothing makes a network call.
//
//   /creatorhub/manage      their video library
//   /manage-content         the flat "My content" list
//   /create/post?id=...     the edit-post page (also gives tagged ASINs)
//   /creatorhub/video/...   the upload/edit page (same)
//   /shop/<own handle>      their own storefront, and only their own
//
// The manage lists are SPA-paginated, so capture runs once on init and again on
// a debounced mutation settle, mirroring the row watcher in youtube-status.

const SETTLE_MS = 400;
const WATCH_MS = 60_000;
const VDP_RE = /\/vdp\/([A-Za-z0-9]{6,})/;

export type CaptureSurface =
  | "creator-manage"
  | "manage-content"
  | "creator-post"
  | "creator-upload"
  | "storefront";

// Capture now, then watch for SPA-loaded rows for a minute. `handle` is the
// creator's own storefront handle, required for the storefront surface (their
// own /shop/ page is theirs; anyone else's is not).
export function captureOwnVideos(surface: CaptureSurface, handle: string | null): void {
  const run = (): void => {
    const records = collect(surface, handle);
    if (records.length === 0) return;
    log("my-video", "captured own videos", { surface, count: records.length });
    void rememberOwnVideos(records);
  };

  run();
  if (surface === "creator-post" || surface === "creator-upload") return;
  watchForRows(run);
}

function collect(surface: CaptureSurface, handle: string | null): Array<Omit<OwnVideoRecord, "seenAt">> {
  switch (surface) {
    case "creator-manage":
      return fromRows(readManageRows(document), "creator-manage");
    case "manage-content":
      return fromRows(readManageContentRows(document), "manage-content");
    case "creator-post":
    case "creator-upload":
      return fromUploadState(surface);
    case "storefront":
      return fromOwnStorefront(handle);
    default:
      return [];
  }
}

function fromRows(
  rows: Array<{ contentId: string; title: string | null }>,
  source: OwnVideoSource,
): Array<Omit<OwnVideoRecord, "seenAt">> {
  return rows
    .filter((r) => r.contentId)
    .map((r) => ({
      contentId: r.contentId,
      title: r.title,
      asins: [],
      marketplace: null,
      source,
    }));
}

// The edit / upload page: one video, and the only surface that also hands us the
// ASINs it is tagged to.
function fromUploadState(source: OwnVideoSource): Array<Omit<OwnVideoRecord, "seenAt">> {
  const state = readUploadState(document);
  const urlId = new URLSearchParams(location.search).get("id");
  const contentId = contentIdFromVseId(state?.contentId) ?? contentIdFromVseId(urlId);
  if (!contentId) return [];
  return [
    {
      contentId,
      title: state?.title ?? null,
      asins: state?.asins ?? [],
      marketplace: state?.marketplaceCode ?? null,
      source,
    },
  ];
}

// The creator's own storefront. Gated hard on the handle in the URL matching
// the creator's own: every /vdp/ link on somebody else's storefront belongs to
// somebody else, and remembering one would put a "Yours" badge on their video.
function fromOwnStorefront(handle: string | null): Array<Omit<OwnVideoRecord, "seenAt">> {
  const want = String(handle ?? "").trim().toLowerCase();
  if (!want) return [];
  const here = location.pathname.match(/\/shop\/([^/?#]+)/)?.[1];
  if (!here || decodeURIComponent(here).trim().toLowerCase() !== want) return [];

  const out: Array<Omit<OwnVideoRecord, "seenAt">> = [];
  const seen = new Set<string>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/vdp/"]'))) {
    const id = (a.getAttribute("href") ?? "").match(VDP_RE)?.[1]?.toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      contentId: id,
      title: a.textContent?.trim().slice(0, 200) || null,
      asins: [],
      marketplace: null,
      source: "storefront",
    });
  }
  return out;
}

// Debounced mutation watcher, self-disconnecting after a minute so a tab left
// open on the manage list does not keep an observer alive forever.
function watchForRows(run: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, SETTLE_MS);
  });
  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {
    return;
  }
  setTimeout(() => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  }, WATCH_MS);
}
