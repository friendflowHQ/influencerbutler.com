import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import {
  readManageRows,
  readManageContentRows,
  readUploadState,
  contentIdFromVseId,
} from "../../amazon/creator-hub";
import { resolveYouTubeStatus, type YouTubeStatusLookup } from "./status";
import { youtubeChipState, amazonShowingState } from "./model";
import {
  sendToBackground,
  type HudCommandResult,
  type YouTubeVideoRef,
} from "../../shared/messages";

// Per-video "On YouTube / Not on YouTube" chip fed by the desktop YouTube Butler
// upload ledger over the local bridge, plus an "Upload to YouTube" action that
// hands the video to the desktop uploader, and a page-DOM "Showing on Amazon /
// Not on detail pages" chip. Runs on five Amazon surfaces:
//   creator-manage  (/creatorhub/manage)   per-row, SPA-observed
//   creator-post    (/create/post?id=...)  single video, id from URL/upload-state
//   manage-content  (/manage-content)      per-row, SPA-observed
//   storefront      (/shop/<handle>)       per video card, SPA-observed
// The product /dp/ carousel is intentionally NOT stamped here: those videos are
// mostly other creators', and we cannot safely tell the user's own apart, so
// stamping "Upload" there would be wrong (tracked as a follow-up).
//
// Self-gating: when the desktop app is not paired/running the chip shows a muted
// "connect the app" state (upload status lives only on the desktop). The Amazon
// "showing on detail pages" chip is a pure DOM read and renders regardless.

export type YouTubeSurface =
  | "creator-manage"
  | "creator-post"
  | "manage-content"
  | "storefront";

const DONE_ATTR = "data-ib-ytstatus";
const HOST_CLASS = "ytstatus-host";
const VDP_LINK_RE = /\/vdp\/([^/?#]+)/;

// One video to stamp, resolved from a surface's DOM.
type Target = {
  contentId: string; // lowercased bare hex
  doneEl: HTMLElement; // marked with DONE_ATTR so it decorates once
  mountEl: HTMLElement; // the chip strip is inserted after this
  title: string | null;
  asin: string | null;
  contentUrl: string | null; // full /vdp/ url when the surface exposed it
  published: boolean;
  notShowing: boolean;
  // Filled at mount time. The chip strip lives in a closed shadow root, so we
  // keep the body reference to repaint it (a closed root can't be re-queried).
  body?: HTMLElement;
  marketplace?: string;
};

let controller: AbortController | null = null;
let rowObserver: MutationObserver | null = null;

export function initYouTubeStatus(surface: YouTubeSurface): void {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  rowObserver?.disconnect();
  rowObserver = null;
  teardown();

  const marketplace = marketplaceFromUrl(location.href);

  // Decorate whatever is present now, then re-decorate on SPA re-renders. Each
  // pass mounts chip shells immediately (unknown state) and resolves status in
  // the background so nothing waits on the bridge round trip.
  const decorate = (): void => {
    const targets = collectTargets(surface).filter((tg) => !tg.doneEl.getAttribute(DONE_ATTR));
    if (targets.length === 0) return;
    for (const tg of targets) {
      tg.doneEl.setAttribute(DONE_ATTR, "1");
      tg.marketplace = marketplace;
      mountChips(tg);
    }
    void resolveAndRender(targets, run.signal);
  };

  if (surface === "creator-post") {
    // Single video: it may hydrate its upload-state script after first paint, so
    // poll briefly, then decorate once.
    void decorateWhenReady(run.signal, decorate);
    return;
  }

  watchRows(run.signal, decorate);
  decorate();
}

// ---- Target collection (per surface) ----------------------------------------

function collectTargets(surface: YouTubeSurface): Target[] {
  if (surface === "creator-manage") return collectManageRows();
  if (surface === "manage-content") return collectManageContentRows();
  if (surface === "storefront") return collectStorefrontCards();
  return collectCreatorPost();
}

function collectManageRows(): Target[] {
  return readManageRows(document).map((r) => ({
    contentId: r.contentId.toLowerCase(),
    doneEl: r.el,
    mountEl: r.el,
    title: r.title,
    asin: null,
    contentUrl: vdpUrlIn(r.el),
    published: r.status === "published",
    notShowing: detectNotShowing(r.el),
  }));
}

function collectManageContentRows(): Target[] {
  return readManageContentRows(document).map((r) => ({
    contentId: r.contentId.toLowerCase(),
    doneEl: r.el,
    mountEl: r.el,
    title: r.title,
    asin: null,
    contentUrl: vdpUrlIn(r.el),
    published: r.status === "published",
    notShowing: detectNotShowing(r.el),
  }));
}

// Storefront /shop/ video cards: each carries a /vdp/<contentId> link. Climb to
// the card container so the chip sits under the whole card, not just the link.
function collectStorefrontCards(): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/vdp/"]'))) {
    const href = a.getAttribute("href") ?? "";
    const id = href.match(VDP_LINK_RE)?.[1]?.toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const card = cardContainer(a);
    out.push({
      contentId: id,
      doneEl: card,
      mountEl: card,
      title: a.textContent?.trim().slice(0, 200) || null,
      asin: null,
      contentUrl: absoluteUrl(href),
      // The storefront always shows the video; no on-detail-page banner here.
      published: true,
      notShowing: false,
    });
  }
  return out;
}

// The /create/post edit page: one video. Prefer Amazon's own upload-state script
// (gives contentId + title + asins + marketplace + status); fall back to the ?id=
// query. The "not showing on detail pages" banner is read from the page.
function collectCreatorPost(): Target[] {
  const state = readUploadState(document);
  const urlId = new URLSearchParams(location.search).get("id");
  const contentId = contentIdFromVseId(state?.contentId) ?? contentIdFromVseId(urlId);
  if (!contentId) return [];
  const anchor = createPostAnchor();
  if (!anchor) return [];
  return [
    {
      contentId,
      doneEl: anchor,
      mountEl: anchor,
      title: state?.title ?? null,
      asin: state?.asins[0] ?? null,
      contentUrl: `https://${location.host}/vdp/${contentId}`,
      published: (state?.statusState ?? "").toUpperCase() === "PUBLISHED",
      notShowing: detectNotShowing(document.body),
    },
  ];
}

// ---- Resolve + render --------------------------------------------------------

async function resolveAndRender(targets: Target[], signal: AbortSignal): Promise<void> {
  const lookup = await resolveYouTubeStatus(targets.map((tg) => tg.contentId));
  if (signal.aborted) return;
  for (const tg of targets) {
    if (tg.body) renderChips(tg.body, tg, "resolved", lookup);
  }
}

// mountChips places the chip strip and paints an initial "unknown" state (before
// the lookup lands). renderChips repaints once status resolves.
function mountChips(tg: Target): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const wrap = el("div", "tile-badge");
  const body = el("div", "tile-badge-body");
  wrap.append(body);
  root.append(wrap);
  host.style.display = "block";
  if (!tg.mountEl.insertAdjacentElement("afterend", host)) tg.mountEl.append(host);
  tg.body = body;
  // Initial paint: unknown YouTube state + the pure-DOM Amazon showing chip.
  renderChips(body, tg, "unknown", { paired: false, byId: new Map() });
}

function renderChips(
  body: HTMLElement,
  tg: Target,
  _phase: "unknown" | "resolved",
  lookup: YouTubeStatusLookup,
): void {
  if (!body.isConnected) return;
  body.replaceChildren();

  // 1) The on-Amazon "showing on detail pages" chip (pure DOM, no bridge).
  const showing = amazonShowingState({ published: tg.published, notShowing: tg.notShowing });
  if (showing === "showing") {
    body.append(el("span", "tile-chip good", t().ytShowingAmazon));
  } else if (showing === "not-showing") {
    body.append(el("span", "tile-chip bad", t().ytNotShowingAmazon));
  }

  // 2) The YouTube upload-status chip.
  const chip = youtubeChipState(tg.contentId, lookup);
  if (chip.state === "unknown") {
    body.append(el("span", "tile-chip muted", t().ytConnectApp));
    return;
  }
  if (chip.state === "on") {
    const url = chip.record?.youtubeUrl ?? null;
    // A real anchor opens the external YouTube link on click (the background
    // OPEN_URL is same-origin-only, so it cannot open youtu.be). Shadow-root
    // anchors navigate normally; keep it noopener for safety.
    const link = el("a", "tile-chip good") as HTMLAnchorElement;
    link.textContent = t().ytOnYouTube;
    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = url;
    }
    link.addEventListener("click", (event) => event.stopPropagation());
    body.append(link);
    return;
  }
  // chip.state === "off": not on YouTube (or a failed record). Offer Upload.
  const failed = chip.record?.status === "failed";
  body.append(el("span", `tile-chip ${failed ? "bad" : "muted"}`, failed ? t().ytFailedRetry : t().ytNotOnYouTube));
  body.append(uploadButton(tg, body));
}

function uploadButton(tg: Target, body: HTMLElement): HTMLButtonElement {
  const btn = el("button", "tile-chip yt-upload-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = t().ytUpload;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void triggerUpload(tg, body, btn);
  });
  return btn;
}

async function triggerUpload(tg: Target, body: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = t().ytUploading;
  const video: YouTubeVideoRef = {
    contentId: tg.contentId,
    asin: tg.asin ?? undefined,
    title: tg.title ?? undefined,
    marketplace: tg.marketplace || undefined,
    contentUrl: tg.contentUrl ?? undefined,
  };
  let res: HudCommandResult;
  try {
    res = await sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "youtube.upload", video },
    });
  } catch {
    btn.disabled = false;
    btn.textContent = t().ytUpload;
    btn.title = t().ytUploadError;
    return;
  }
  if (!res.ok) {
    btn.disabled = false;
    btn.textContent = t().ytUpload;
    btn.title = res.needsPairing ? t().ytConnectApp : res.message ?? t().ytUploadError;
    return;
  }
  // Queued + uploading on the desktop. Poll for the flip to "On YouTube" while the
  // page stays open; the desktop finishes regardless, so a later visit shows green.
  void pollUntilUploaded(tg, body);
}

async function pollUntilUploaded(tg: Target, body: HTMLElement): Promise<void> {
  const signal = controller?.signal;
  for (let i = 0; i < 12; i += 1) {
    await sleep(20000);
    if (signal?.aborted || !body.isConnected) return;
    const lookup = await resolveYouTubeStatus([tg.contentId]);
    if (signal?.aborted || !body.isConnected) return;
    const chip = youtubeChipState(tg.contentId, lookup);
    if (chip.state === "on") {
      renderChips(body, tg, "resolved", lookup);
      return;
    }
  }
}

// ---- DOM helpers -------------------------------------------------------------

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

// Climb from a storefront card's /vdp/ link to the card container: the largest
// ancestor that still holds exactly one /vdp/ link, so a chip scopes to one card.
function cardContainer(seed: HTMLElement): HTMLElement {
  let best: HTMLElement = seed;
  let node: HTMLElement | null = seed.parentElement;
  for (let i = 0; i < 8 && node; i += 1) {
    if (node.querySelectorAll('a[href*="/vdp/"]').length > 1) break;
    best = node;
    node = node.parentElement;
  }
  return best;
}

// The /create/post page anchor to hang the chip after: the Title box's heading or
// the Save/Get link controls, falling back to the "Edit post" heading or body.
function createPostAnchor(): HTMLElement | null {
  const save = document.querySelector<HTMLElement>("[data-testid*='save' i], button");
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).find((h) =>
    /edit post/i.test(h.textContent ?? ""),
  );
  return heading ?? save ?? document.querySelector<HTMLElement>("main") ?? document.body;
}

// The Amazon "published but not showing on product detail pages" state, read from
// the page/row text (the "Reach more shoppers" quality banner or the "Improve
// reach" row affordance). Locale-tolerant on the English phrasing Amazon uses.
function detectNotShowing(scope: ParentNode): boolean {
  const text = ((scope as HTMLElement).textContent ?? "").toLowerCase();
  return (
    text.includes("improve reach") ||
    text.includes("isn't being shown on product detail") ||
    text.includes("not being shown on product detail") ||
    text.includes("published but not showing")
  );
}

async function decorateWhenReady(signal: AbortSignal, decorate: () => void): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    if (signal.aborted) return;
    if (readUploadState(document) || new URLSearchParams(location.search).get("id")) {
      decorate();
      return;
    }
    await sleep(500);
  }
  if (!signal.aborted) decorate();
}

// The manage/storefront lists re-render on pagination/scroll without a URL change
// (the SPA watcher in content/index.ts does not re-run us), so re-decorate newly
// rendered rows as they appear.
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function teardown(): void {
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  for (const marked of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
  }
  log("youtube-status", "teardown");
}
