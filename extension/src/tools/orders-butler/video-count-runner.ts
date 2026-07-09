import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { getState } from "../../storage/store";
import { sendToBackground } from "../../shared/messages";
import type {
  AsinEarnings,
  EarningsLookupResult,
  OrderAsinItem,
  OrderAsinsResult,
  ScanAsinResult,
} from "../../shared/messages";
import type { CachedScan } from "../../storage/schema";
import { log } from "../../shared/log";

// Orders Butler: "Update influencer video count". Sits under the harvester in
// the same panel. Gathers the products the account has ordered, then opens each
// one in a background tab (via the worker) so its client-side video breakdown
// hydrates, and shows how many influencer videos each already has. Rows seed
// from the local scan cache so products the user has already viewed show a count
// instantly, and refresh as each background scan resolves. Sequential, paced,
// and abortable, mirroring the harvester's own run/stop idiom.
//
// Two decision aids ride on top when the desktop app is paired: each product is
// tagged with what the creator has already earned on it (F13), and a product
// that has earned money but has NO influencer video is flagged "film first" -
// the highest-return gap. A coverage summary (F19) totals how much of what you
// own already has your content.

const ASIN_HREF_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;
// A small gap between products so the pass reads like a person opening tabs.
// The tab scan itself already dwells for seconds, so this stays short.
const BETWEEN_MS = 900;

type Earned = { amount: number; currency: string };

type Row = {
  asin: string;
  el: HTMLElement;
  detail: HTMLElement;
  earned: Earned | null;
  influencer: number | null;
};

export function initOrderVideoCounts(marketplace: string): void {
  const section = addSection(t().updateVideoCounts);

  const intro = el("p", "note");
  intro.textContent = t().updateVideoCountsIntro;
  section.append(intro);

  const button = el("button", "btn");
  button.textContent = t().updateVideoCounts;
  const stopBtn = el("button", "btn secondary");
  stopBtn.textContent = t().sfStop;
  stopBtn.style.display = "none";
  const controls = el("div", "row");
  controls.append(button, stopBtn);

  const progress = el("p", "progress");
  const coverage = el("div", "counts");
  const resultsList = el("ul", "list");
  section.append(controls, progress, coverage, resultsList);

  const rows = new Map<string, Row>();
  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  stopBtn.addEventListener("click", () => abort?.abort());

  button.addEventListener("click", () => {
    void run();
  });

  async function run(): Promise<void> {
    button.disabled = true;
    stopBtn.style.display = "inline-block";
    resultsList.replaceChildren();
    coverage.replaceChildren();
    rows.clear();
    progress.textContent = t().countPreparing;
    abort = new AbortController();
    const signal = abort.signal;

    try {
      const items = await gatherItems(marketplace);
      if (items.length === 0) {
        progress.textContent = t().countNoOrders;
        return;
      }

      const [state, earnings] = await Promise.all([
        getState(),
        fetchEarnings(items.map((i) => i.asin)),
      ]);
      const cache = state.cache;
      for (const item of items) {
        rows.set(item.asin, addRow(resultsList, item, cache, earnings.get(item.asin) ?? null));
      }

      let updated = 0;
      let noInfluencer = 0;
      for (const [index, item] of items.entries()) {
        if (signal.aborted) break;
        progress.textContent = t().countChecking(index + 1, items.length, rowTitle(item));

        let result: ScanAsinResult;
        try {
          result = await sendToBackground<ScanAsinResult>({
            kind: "SCAN_ASIN_IN_TAB",
            asin: item.asin,
            marketplace: item.marketplace,
          });
        } catch (error) {
          log("order-video-counts", `scan failed for ${item.asin}`, error);
          continue;
        }

        if (result.classified && result.counts) {
          updated += 1;
          if (result.counts.influencer === 0) noInfluencer += 1;
          setRow(rows.get(item.asin), result.counts.influencer);
        } else {
          setRow(rows.get(item.asin), null);
        }

        if (!signal.aborted) await pause(BETWEEN_MS, signal);
      }

      renderCoverage(coverage, [...rows.values()]);
      progress.textContent = signal.aborted
        ? t().countStopped(updated)
        : t().countDone(updated, noInfluencer);
    } catch (error) {
      if (!signal.aborted) log("order-video-counts", "run failed", error);
      progress.textContent = t().countStopped(0);
    } finally {
      button.disabled = false;
      button.textContent = t().updateVideoCountsAgain;
      stopBtn.style.display = "none";
    }
  }
}

// One batched earnings lookup against the desktop app ledger, reduced to the
// primary (largest) currency per ASIN. Returns an empty map when the app was
// never paired, so everything below simply skips the earnings aids.
async function fetchEarnings(asins: string[]): Promise<Map<string, Earned>> {
  const out = new Map<string, Earned>();
  try {
    const res = await sendToBackground<EarningsLookupResult>({ kind: "LOOKUP_EARNINGS", asins });
    if (!res.ok) return out;
    for (const e of res.results) {
      const primary = primaryEarned(e);
      if (primary) out.set(e.asin.toUpperCase(), primary);
    }
  } catch {
    // app not reachable: no earnings aids, the counts still work
  }
  return out;
}

function primaryEarned(e: AsinEarnings): Earned | null {
  if (!e.hasEarnings) return null;
  let best: Earned | null = null;
  for (const c of e.byCurrency) {
    if (c.amount > 0 && (!best || c.amount > best.amount)) {
      best = { amount: c.amount, currency: c.currency };
    }
  }
  return best;
}

// The products to run over: the synced order history from the worker, or, when
// the user is signed out, whatever products are on the current order-history
// page. Deduped to one entry per ASIN.
async function gatherItems(marketplace: string): Promise<OrderAsinItem[]> {
  try {
    const res = await sendToBackground<OrderAsinsResult>({ kind: "GET_ORDER_ASINS" });
    if (res.ok && res.items.length > 0) return res.items;
  } catch (error) {
    log("order-video-counts", "could not load order list", error);
  }
  return gatherOnPageItems(marketplace);
}

function gatherOnPageItems(marketplace: string): OrderAsinItem[] {
  const seen = new Set<string>();
  const items: OrderAsinItem[] = [];
  for (const anchor of Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href*='/dp/'], a[href*='/gp/product/']"),
  )) {
    const match = (anchor.getAttribute("href") ?? "").match(ASIN_HREF_RE);
    if (!match || !match[1] || seen.has(match[1])) continue;
    const title = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (title.length < 8) continue; // skip thumbnails and icon links
    seen.add(match[1]);
    items.push({ asin: match[1], marketplace, title: title.slice(0, 200) });
  }
  return items;
}

function addRow(
  list: HTMLElement,
  item: OrderAsinItem,
  cache: Record<string, CachedScan>,
  earned: Earned | null,
): Row {
  const li = el("li");
  li.append(el("span", "t", rowTitle(item)));
  if (earned) li.append(chip("good", t().ofrEarnedChip(formatMoney(earned.amount, earned.currency))));
  const detail = el("span");
  // Seed from a prior real product visit if we have one, so known products show
  // a count before their background scan even runs.
  const cached = cache[`${item.marketplace}:${item.asin}`];
  const seededInfluencer = cached ? cached.counts.influencer : null;
  detail.textContent = cached ? countText(cached.counts.influencer) : t().countPending;
  li.append(detail);
  list.append(li);
  const row: Row = { asin: item.asin, el: li, detail, earned, influencer: seededInfluencer };
  applyFilmFirst(row);
  return row;
}

function setRow(row: Row | undefined, influencer: number | null): void {
  if (!row) return;
  row.influencer = influencer;
  row.detail.textContent = influencer === null ? t().countPending : countText(influencer);
  applyFilmFirst(row);
}

// A product you have earned money on but that has NO influencer video is the
// highest-return gap: flag it "film first". Idempotent (removes a prior badge
// before re-adding), since a row is re-evaluated as its scan resolves.
function applyFilmFirst(row: Row): void {
  const existing = row.el.querySelector(".ofr-film-first");
  if (existing) existing.remove();
  if (row.earned && row.influencer === 0) {
    const badge = chip("bad", t().ofrFilmFirst);
    badge.classList.add("ofr-film-first");
    row.el.append(badge);
  }
}

// Coverage summary (F19): of the products scanned, how many already have your
// content, how many are gaps, and how many of those gaps are proven earners.
function renderCoverage(container: HTMLElement, rows: Row[]): void {
  const scanned = rows.filter((r) => r.influencer !== null);
  if (scanned.length === 0) return;
  const covered = scanned.filter((r) => (r.influencer ?? 0) > 0).length;
  const gaps = scanned.filter((r) => r.influencer === 0);
  const earningGaps = gaps.filter((r) => r.earned).length;

  container.replaceChildren();
  container.append(chip("", t().ofrCoverage(covered, scanned.length)));
  container.append(chip(gaps.length > 0 ? "warn" : "good", t().ofrGaps(gaps.length)));
  if (earningGaps > 0) container.append(chip("bad", t().ofrEarningGaps(earningGaps)));
}

// Amounts arrive in whole currency units. Symbol for the common creator
// currencies, ISO code otherwise, always two decimals.
function formatMoney(amount: number, currency: string): string {
  const symbol =
    currency === "GBP"
      ? "£"
      : currency === "EUR"
        ? "€"
        : currency === "USD" || currency === "CAD" || currency === "AUD"
          ? "$"
          : "";
  const value = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

function countText(influencer: number): string {
  return influencer === 0 ? t().countNoInfluencer : t().countInfluencerN(influencer);
}

function rowTitle(item: OrderAsinItem): string {
  return (item.title ?? item.asin).slice(0, 60);
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
