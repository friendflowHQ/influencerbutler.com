import { log } from "../../shared/log";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { readManageContentRows } from "../../amazon/creator-hub";
import { parseAudioSuppressed } from "./model";
import {
  sendToBackground,
  type HudCommandResult,
  type AudioSuppressedItem,
} from "../../shared/messages";

// Silent background reporter for Amazon's Creator Hub "Audio suppressed" badge
// (Notifications column of the /manage-content "My content" list). Unlike
// tools/youtube-status, this feature renders no chip or card on the page: it
// only detects the signal and reports it to the desktop Video Reload Butler so
// the creator gets one "what needs a re-upload with a voiceover" list. Mirrors
// the detect + report half of tools/youtube-status/overlay.ts (collect rows,
// parse page text, dedupe + send), minus the mount/render half, and runs only
// on the manage-content surface.

// One row read this pass. `flagged` is whether its text carried the "Audio
// suppressed" badge; only flagged rows are ever reported (see reportAudioSuppressed).
type Target = {
  contentId: string; // lowercased bare hex
  title: string | null;
  contentUrl: string | null;
  editUrl: string | null;
  flagged: boolean;
  marketplace?: string;
};

let controller: AbortController | null = null;
let rowObserver: MutationObserver | null = null;
// contentIds already reported to the desktop Video Reload Butler this run, so
// SPA re-renders don't re-send the same flagged items on every mutation pass.
const reportedAudioSuppressed = new Set<string>();

export function initAudioSuppressed(): void {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  rowObserver?.disconnect();
  rowObserver = null;
  reportedAudioSuppressed.clear();

  const marketplace = marketplaceFromUrl(location.href);

  const decorate = (): void => {
    const targets = collectTargets();
    for (const tg of targets) tg.marketplace = marketplace;
    reportAudioSuppressed(targets);
  };

  watchRows(run.signal, decorate);
  decorate();
}

// ---- Target collection -------------------------------------------------------

function collectTargets(): Target[] {
  return readManageContentRows(document).map((r) => {
    const contentId = r.contentId.toLowerCase();
    return {
      contentId,
      title: r.title,
      contentUrl: vdpUrlIn(r.el),
      editUrl: editUrlFor(r.el, contentId),
      flagged: parseAudioSuppressed(r.el.innerText || r.el.textContent || ""),
    };
  });
}

// ---- Report -------------------------------------------------------------------

// Report the flagged rows in this decorate pass to the desktop Video Reload
// Butler workspace (fire-and-forget, deduped by contentId). The desktop upserts
// them into a durable store for a single "needs a voiceover re-upload" view.
// Silent when the app is not paired; there is no chip to fall back on.
function reportAudioSuppressed(targets: Target[]): void {
  const items: AudioSuppressedItem[] = [];
  for (const tg of targets) {
    if (!tg.flagged || reportedAudioSuppressed.has(tg.contentId)) continue;
    reportedAudioSuppressed.add(tg.contentId);
    items.push({
      contentId: tg.contentId,
      title: tg.title ?? undefined,
      marketplace: tg.marketplace || undefined,
      contentUrl: tg.contentUrl ?? undefined,
      editUrl: tg.editUrl ?? undefined,
    });
  }
  if (items.length === 0) return;
  void sendToBackground<HudCommandResult>({
    kind: "SEND_HUD_COMMAND",
    command: { type: "audioSuppressed.report.batch", items },
  }).catch(() => {
    // Not paired / app closed: the store just misses this pass. Harmless.
  });
}

// ---- DOM helpers ---------------------------------------------------------------

function vdpUrlIn(row: HTMLElement): string | null {
  const a = row.querySelector<HTMLAnchorElement>('a[href*="/vdp/"]');
  return a ? absoluteUrl(a.getAttribute("href") ?? "") : null;
}

function absoluteUrl(href: string): string {
  try {
    return new URL(href, location.origin).toString();
  } catch {
    return href;
  }
}

// The item's "Edit post" URL: a real /create/post link inside the row when
// present, else reconstructed from the bare-hex contentId (video shape).
function editUrlFor(row: HTMLElement, contentId: string): string | null {
  const a = row.querySelector<HTMLAnchorElement>('a[href*="/create/post"]');
  if (a) return absoluteUrl(a.getAttribute("href") ?? "");
  if (/^[0-9a-f]{16,}$/i.test(contentId)) {
    return `https://${location.host}/create/post?id=amzn1.vse.video.${contentId}`;
  }
  return null;
}

// The /manage-content list re-renders on pagination/scroll without a URL change
// (the SPA watcher in content/index.ts does not re-run us), so re-decorate newly
// rendered rows as they appear. Mirrors watchRows in youtube-status/overlay.ts.
function watchRows(signal: AbortSignal, decorate: () => void): void {
  const target = document.querySelector<HTMLElement>("main") ?? document.body;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (signal.aborted) return;
      decorate();
    }, 400);
  });
  observer.observe(target, { childList: true, subtree: true });
  rowObserver = observer;
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  log("audio-suppressed", "watching rows");
}
