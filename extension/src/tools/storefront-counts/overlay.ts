import { t } from "../../i18n";
import { harvestStorefront, type ContentType } from "../storefront-check/harvest";

// Content counts in the storefront search box: Amazon's placeholder only says
// "Search all N posts", so we replace it with the split by content type
// ("Search all 191 posts/1 videos/283 idea lists/15 pics"). The numbers come from
// the same getItems feed the storefront checkup pages through (a handful of
// plain HTML requests), cached per creator for the session, and the box updates
// as pages arrive so a big storefront is never blank while it loads.

const SEARCH_INPUT_SELECTOR = "input[placeholder]";
const POST_COUNT_RE = /\d[\d.,\s]*\s*(posts?|publicaciones|publications)/i;
const CACHE_PREFIX = "ib-sfcounts:";
const CACHE_TTL_MS = 30 * 60 * 1000;

export type StorefrontCounts = Record<ContentType, number>;

type Cached = { at: number; counts: StorefrontCounts; capped: boolean };

let controller: AbortController | null = null;

export function initStorefrontCounts(): void {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  void start(run.signal);
}

function creatorFromPath(): string | null {
  const m = location.pathname.match(/\/shop\/([^/?#]+)/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

// The storefront search box: the input whose own placeholder names the posts.
function findSearchInput(): HTMLInputElement | null {
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>(SEARCH_INPUT_SELECTOR))) {
    if (POST_COUNT_RE.test(input.dataset.ibSfcountsNative ?? input.placeholder)) return input;
  }
  return null;
}

function readCache(creator: string): Cached | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + creator);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return Date.now() - parsed.at < CACHE_TTL_MS ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(creator: string, value: Cached): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + creator, JSON.stringify(value));
  } catch {
    // Cache only; the next page view just re-reads the feed.
  }
}

// Filter pill -> content type (null = the "All" pill). Amazon's tab ids first,
// then the English label as a fallback for a renamed id.
const PILL_IDS: Record<string, ContentType | null> = {
  allTab: null,
  listTab: "idea-list",
  photoTab: "photo",
  videoTab: "video",
  mediaListTab: "media-list",
  mediaTab: "media-list",
};
const PILL_TEXT: Array<[RegExp, ContentType | null]> = [
  [/^all$/i, null],
  [/^idea lists?$/i, "idea-list"],
  [/^photos?$/i, "photo"],
  [/^videos?$/i, "video"],
  [/^media lists?$/i, "media-list"],
];
const PILL_COUNT_ATTR = "data-ib-sfcount";

function pillType(pill: HTMLElement): ContentType | null | undefined {
  if (pill.id in PILL_IDS) return PILL_IDS[pill.id];
  const name = (pill.querySelector("#nav-tab-name")?.firstChild?.textContent ?? "").trim();
  return PILL_TEXT.find(([re]) => re.test(name))?.[1];
}

// Append "(n)" to each filter pill: All, Idea Lists, Media Lists, Photos, Videos.
// Idempotent (updates the span it already added), so re-runs after a React
// re-render just refresh the numbers.
export function labelPills(counts: StorefrontCounts, more: boolean): void {
  const total = counts.video + counts.photo + counts["idea-list"] + counts["media-list"];
  for (const pill of Array.from(document.querySelectorAll<HTMLElement>(".navBtn"))) {
    const type = pillType(pill);
    if (type === undefined) continue;
    const n = type === null ? total : counts[type];
    const text = ` (${n}${more ? "+" : ""})`;
    let span = pill.querySelector<HTMLElement>(`[${PILL_COUNT_ATTR}]`);
    if (!span) {
      span = document.createElement("span");
      span.setAttribute(PILL_COUNT_ATTR, "1");
      span.style.opacity = "0.7";
      span.style.fontSize = "0.9em";
      span.style.marginLeft = "2px";
      pill.append(span);
    }
    if (span.textContent !== text) span.textContent = text;
  }
}

function label(counts: StorefrontCounts, more: boolean): string {
  const total = counts.video + counts.photo + counts["idea-list"] + counts["media-list"];
  return t().sfSearchCounts(
    total,
    counts.video,
    counts["idea-list"],
    counts.photo,
    counts["media-list"],
    more,
  );
}

async function waitForInput(signal: AbortSignal): Promise<HTMLInputElement | null> {
  for (let i = 0; i < 40 && !signal.aborted; i++) {
    const found = findSearchInput();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

async function start(signal: AbortSignal): Promise<void> {
  const creator = creatorFromPath();
  if (!creator) return;
  let input = await waitForInput(signal);
  if (!input || signal.aborted) return;

  // Latest text to show. React can re-render the box and reset the placeholder,
  // so an attribute observer puts ours back (a no-op when it already matches).
  let text: string | null = null;
  let known: { counts: StorefrontCounts; more: boolean } | null = null;
  const apply = (): void => {
    if (known) labelPills(known.counts, known.more);
    if (!text) return;
    const current = findSearchInput() ?? input;
    if (!current) return;
    input = current;
    if (current.dataset.ibSfcountsNative === undefined) {
      current.dataset.ibSfcountsNative = current.placeholder;
    }
    if (current.placeholder !== text) current.placeholder = text;
    if (!current.title) current.title = current.dataset.ibSfcountsNative;
  };
  const observer = new MutationObserver(apply);
  observer.observe(document.querySelector("main") ?? document.body, {
    attributes: true,
    attributeFilter: ["placeholder"],
    childList: true,
    subtree: true,
  });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });

  const cached = readCache(creator);
  if (cached) {
    text = label(cached.counts, cached.capped);
    known = { counts: cached.counts, more: cached.capped };
    apply();
    return;
  }

  const result = await harvestStorefront((_pages, _items) => undefined, creator).catch(() => null);
  if (!result || signal.aborted) return;
  const complete = result.stopReason === "end-of-feed";
  if (result.items.length === 0) return;
  text = label(result.counts, !complete);
  known = { counts: result.counts, more: !complete };
  apply();
  if (complete) writeCache(creator, { at: Date.now(), counts: result.counts, capped: false });
}
