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
import {
  youtubeChipState,
  amazonShowingState,
  parseReachBanner,
  type ReachContentKind,
} from "./model";
import {
  sendToBackground,
  type HudCommandResult,
  type YouTubeVideoRef,
  type ReachItem,
} from "../../shared/messages";

// Per-video "On YouTube / Not on YouTube" chip fed by the desktop YouTube Butler
// upload ledger over the local bridge, plus an "Upload to YouTube" action that
// hands the video to the desktop uploader, and a page-DOM reach chip: "Showing on
// Amazon" when live on detail pages, or an interactive "Improve reach" advisory
// (Amazon's reason + a concrete fix checklist) when held back. Runs on five
// Amazon surfaces:
//   creator-manage  (/creatorhub/manage)   per-row, SPA-observed
//   creator-post    (/create/post?id=...)  single video, id from URL/upload-state
//   manage-content  (/manage-content)      per-row, SPA-observed
//   storefront      (/shop/<handle>)       per video card, SPA-observed
// The product /dp/ carousel is still NOT stamped here. tools/my-video now does
// tell the creator's own carousel video apart (by their storefront handle on the
// rendered card, or by a remembered content id), so the old blocker is gone, but
// an "Upload" action wants a verified card mount on both rails before it moves
// onto a page full of other creators' videos. Tracked as a follow-up.
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
  reachReason: string | null; // Amazon's own reason clause when the banner spelled it out
  reachKind: ReachContentKind;
  // Filled at mount time. The chip strip lives in a closed shadow root, so we
  // keep the body reference to repaint it (a closed root can't be re-queried).
  body?: HTMLElement;
  marketplace?: string;
};

let controller: AbortController | null = null;
let rowObserver: MutationObserver | null = null;
// contentIds already reported to the desktop Reach Booster this run, so SPA
// re-renders don't re-send the same held-back items on every mutation pass.
const reportedReach = new Set<string>();

export function initYouTubeStatus(surface: YouTubeSurface): void {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  rowObserver?.disconnect();
  rowObserver = null;
  reportedReach.clear();
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
    reportReach(targets);
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
  return readManageRows(document).map((r) => {
    const reach = readReach(r.el);
    return {
      contentId: r.contentId.toLowerCase(),
      doneEl: r.el,
      mountEl: r.el,
      title: r.title,
      asin: null,
      contentUrl: vdpUrlIn(r.el),
      published: r.status === "published",
      notShowing: reach.notShowing,
      reachReason: reach.reason,
      reachKind: reach.kind,
    };
  });
}

function collectManageContentRows(): Target[] {
  return readManageContentRows(document).map((r) => {
    const reach = readReach(r.el);
    return {
      contentId: r.contentId.toLowerCase(),
      doneEl: r.el,
      mountEl: r.el,
      title: r.title,
      asin: null,
      contentUrl: vdpUrlIn(r.el),
      published: r.status === "published",
      notShowing: reach.notShowing,
      reachReason: reach.reason,
      reachKind: reach.kind,
    };
  });
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
      reachReason: null,
      reachKind: "video",
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
  const reach = readReach(document.body);
  return [
    {
      contentId,
      doneEl: anchor,
      mountEl: anchor,
      title: state?.title ?? null,
      asin: state?.asins[0] ?? null,
      contentUrl: `https://${location.host}/vdp/${contentId}`,
      published: (state?.statusState ?? "").toUpperCase() === "PUBLISHED",
      notShowing: reach.notShowing,
      reachReason: reach.reason,
      reachKind: reach.kind,
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

  // 1) The on-Amazon "showing on detail pages" chip (pure DOM, no bridge). When
  // held back, the chip becomes an interactive "Improve reach" advisory naming
  // Amazon's reason and the concrete fix (see renderReachAdvice).
  const showing = amazonShowingState({ published: tg.published, notShowing: tg.notShowing });
  if (showing === "showing") {
    body.append(el("span", "tile-chip good", t().ytShowingAmazon));
  } else if (showing === "not-showing") {
    renderReachAdvice(body, tg);
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

// Report the held-back items in this decorate pass to the desktop Reach Booster
// workspace (fire-and-forget, deduped by contentId). The desktop upserts them
// into a durable store so the creator gets one "what needs a re-upload" list.
// Silent when the app is not paired; the chip still renders regardless.
function reportReach(targets: Target[]): void {
  const items: ReachItem[] = [];
  for (const tg of targets) {
    if (!tg.notShowing || reportedReach.has(tg.contentId)) continue;
    reportedReach.add(tg.contentId);
    items.push({
      contentId: tg.contentId,
      title: tg.title ?? undefined,
      kind: tg.reachKind,
      marketplace: tg.marketplace || undefined,
      reason: tg.reachReason,
      contentUrl: tg.contentUrl ?? undefined,
      editUrl: editUrlFor(tg) ?? undefined,
    });
  }
  if (items.length === 0) return;
  void sendToBackground<HudCommandResult>({
    kind: "SEND_HUD_COMMAND",
    command: { type: "reach.report.batch", items },
  }).catch(() => {
    // Not paired / app closed: the store just misses this pass. Harmless.
  });
}

// The "Improve reach" chip: an amber, clickable pill that expands a card naming
// Amazon's reason the item is held back from product detail pages and a concrete
// per-kind fix checklist. Pure DOM read; no bridge. Replaces the old static "Not
// on detail pages" chip so the creator sees exactly what to change.
function renderReachAdvice(body: HTMLElement, tg: Target): void {
  const chip = el("button", "tile-chip warn reach-chip") as HTMLButtonElement;
  chip.type = "button";
  chip.append(document.createTextNode(t().reachImprove));
  const caret = el("span", "reach-caret", "▸"); // right triangle; flips down when open
  chip.append(caret);

  const panel = el("div", "reach-advice");
  panel.hidden = true;
  buildReachPanel(panel, tg);

  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const opening = panel.hidden;
    panel.hidden = !opening;
    chip.classList.toggle("open", opening);
    caret.textContent = opening ? "▾" : "▸";
  });

  body.append(chip);
  body.append(panel);
}

function buildReachPanel(panel: HTMLElement, tg: Target): void {
  panel.append(el("div", "reach-title", t().reachPanelTitle));

  panel.append(el("div", "reach-label", t().reachWhy));
  const reason = tg.reachReason
    ? capitalizeFirst(tg.reachReason)
    : tg.reachKind === "photo"
      ? t().reachReasonPhoto
      : tg.reachKind === "video"
        ? t().reachReasonVideo
        : t().reachReasonGeneric;
  panel.append(el("div", "reach-reason", reason));

  panel.append(el("div", "reach-label", t().reachFix));
  const tips = tg.reachKind === "photo" ? t().reachTipsPhoto : t().reachTipsVideo;
  const list = el("ul");
  for (const tip of tips) list.append(el("li", undefined, tip));
  panel.append(list);

  panel.append(el("div", "reach-remedy", t().reachRemedy));

  // On the list surfaces, jump to the item's edit page (where Amazon's full
  // banner and best-practice link live). On /create/post we are already there.
  if (!/\/create\/post/i.test(location.pathname)) {
    const url = editUrlFor(tg);
    if (url) {
      const link = el("a", "reach-open", t().reachOpenItem) as HTMLAnchorElement;
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.addEventListener("click", (event) => event.stopPropagation());
      panel.append(link);
    }
  }
}

// The item's "Edit post" URL: a real /create/post link inside the row when
// present, else reconstructed from the bare-hex contentId (video shape).
function editUrlFor(tg: Target): string | null {
  const a = tg.mountEl.querySelector<HTMLAnchorElement>('a[href*="/create/post"]');
  if (a) return absoluteUrl(a.getAttribute("href") ?? "");
  if (/^[0-9a-f]{16,}$/i.test(tg.contentId)) {
    return `https://${location.host}/create/post?id=amzn1.vse.video.${tg.contentId}`;
  }
  return null;
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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

// The Amazon "published but not showing on product detail pages" state, parsed
// from the page/row text (the "Reach more shoppers" quality banner on the item
// edit page, or the compact "Improve reach" affordance on the list rows). Returns
// whether it is held back plus, when the edit-page banner spelled it out, Amazon's
// own reason clause and the content kind, so the chip can name the exact fix.
function readReach(scope: ParentNode): {
  notShowing: boolean;
  reason: string | null;
  kind: ReachContentKind;
} {
  const banner = parseReachBanner((scope as HTMLElement).textContent ?? "");
  return { notShowing: banner.notShowing, reason: banner.reason, kind: banner.kind };
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
