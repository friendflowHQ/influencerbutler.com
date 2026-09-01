import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t, getLocale } from "../../i18n";
import { log } from "../../shared/log";
import {
  extractCampaignAsins,
  parseCampaignText,
  daysUntil,
} from "../../amazon/creator-campaigns";
import {
  computeCampaignScore,
  computeCampaignConfidence,
  type CampaignScore,
  type CampaignScoreBand,
  type CampaignScoreInputs,
} from "./score";
import { getCachedVideoCounts, putCachedVideoCount } from "./video-count-cache";
import { sendToBackground } from "../../shared/messages";
import type { MarketBatchResult, MarketProduct } from "../../shared/messages";
import type { Settings } from "../../storage/schema";

// Campaign detail overlay: a persistent panel on a SINGLE campaign's
// /p/connect/request page (distinct from the grid). The grid's per-card badge and
// the on-demand Butler's Brief modal cannot run here (no campaign-card testids),
// so this reads the detail DOM directly: the campaign's commission / budget /
// dates for a Radar score, and every product it lists for a per-product demand +
// creator-video-saturation read. Same reuse as the grid (score.ts, GET_MARKET_BATCH,
// FETCH_VIDEO_COUNT, the video-count cache); a floating card rather than a modal so
// the creator can still read the page while it is open.

// The detail page is amazon.com (US associates host); its product ASINs are
// amazon.com products, so both reads target that marketplace.
const MARKETPLACE = "amazon.com";
const HOST_CLASS = "radar-detail-host";
// Cap the products we fetch so a campaign with a long catalogue does not fan out
// into dozens of product-page fetches; the first several are the representative set.
const MAX_PRODUCTS = 12;
// The detail page is a React SPA whose Products list can hydrate after our first
// pass. Retry a few times before giving up rather than mounting an empty panel.
const RETRY_MS = 700;
const MAX_RETRIES = 5;

const BAND_COLOR: Record<CampaignScoreBand, string> = {
  hot: "#16a34a",
  warm: "#f59e0b",
  cool: "#6b7280",
};

let mountedHost: HTMLElement | null = null;
// Init epoch, mirroring initCampaignRadar: an SPA nav can start a new run while an
// async fetch from the previous one is in flight, so each run bails after an await
// once a newer run has begun.
let epoch = 0;

export async function initCampaignDetail(_settings: Settings): Promise<void> {
  teardown();
  const mine = ++epoch;
  await run(mine, 0);
}

function teardown(): void {
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  mountedHost = null;
}

type ProductRow = {
  asin: string;
  title: string | null;
  market: MarketProduct | null;
  // null = not looked up yet; a number (0 included) once resolved.
  videoCount: number | null;
  bodyEl: HTMLElement;
};

async function run(mine: number, attempt: number): Promise<void> {
  const asins = extractCampaignAsins(document.body).slice(0, MAX_PRODUCTS);
  const fields = parseCampaignText(document.body.textContent ?? "");

  // Nothing to show yet: retry while the SPA hydrates, then give up quietly.
  if (asins.length === 0 && fields.commissionRatePct === null) {
    if (attempt >= MAX_RETRIES) return;
    window.setTimeout(() => {
      if (mine === epoch) void run(mine, attempt + 1);
    }, RETRY_MS);
    return;
  }

  const now = new Date();
  const daysRemaining = fields.endsAt ? daysUntil(fields.endsAt, now) : null;
  const inputs: CampaignScoreInputs = {
    commissionRatePct: fields.commissionRatePct,
    daysRemaining,
    remainingBudgetCents: fields.remainingBudgetCents,
    owned: null,
    provenEarner: null,
    fillPct: null,
    fullyClaimed: null,
  };
  const score = computeCampaignScore(inputs);

  const titles = readProductTitles(document.body);
  const rows: ProductRow[] = asins.map((asin) => ({
    asin,
    title: titles.get(asin.toUpperCase()) ?? null,
    market: null,
    videoCount: null,
    bodyEl: el("div"),
  }));

  const confidence = computeCampaignConfidence(inputs, {
    hasDemand: rows.length > 0,
    hasCcStats: false,
  });

  mount(score, confidence, rows);
  if (mine !== epoch) return;

  // Demand for every product in one round trip, then video saturation per ASIN
  // (cache-first, then a worker fetch for the misses). Both update the rows in
  // place; a failure just leaves that row's figures as "no data".
  if (rows.length > 0) {
    void enrichDemand(mine, rows);
    void enrichVideoCounts(mine, rows);
  }
}

async function enrichDemand(mine: number, rows: ProductRow[]): Promise<void> {
  try {
    const res = await sendToBackground<MarketBatchResult>({
      kind: "GET_MARKET_BATCH",
      asins: rows.map((r) => r.asin),
      marketplace: MARKETPLACE,
    });
    if (mine !== epoch) return;
    const byAsin = new Map(res.products.map((p) => [p.asin.toUpperCase(), p]));
    for (const row of rows) {
      row.market = byAsin.get(row.asin.toUpperCase()) ?? null;
      renderRow(row);
    }
  } catch (error) {
    log("campaign-detail", "market batch failed", error);
  }
}

async function enrichVideoCounts(mine: number, rows: ProductRow[]): Promise<void> {
  const cached = await getCachedVideoCounts(rows.map((r) => r.asin), MARKETPLACE);
  if (mine !== epoch) return;
  const pending: ProductRow[] = [];
  for (const row of rows) {
    const hit = cached[row.asin.toUpperCase()];
    if (hit !== undefined) {
      row.videoCount = hit;
      renderRow(row);
    } else {
      pending.push(row);
    }
  }
  // Paced sequential fetches so we do not hammer amazon.com; the detail page has
  // at most MAX_PRODUCTS of them.
  for (const row of pending) {
    if (mine !== epoch) return;
    const count = await sendToBackground<number | null>({
      kind: "FETCH_VIDEO_COUNT",
      asin: row.asin,
      marketplace: MARKETPLACE,
    }).catch(() => null);
    if (mine !== epoch) return;
    if (count !== null) {
      row.videoCount = count;
      renderRow(row);
      void putCachedVideoCount(row.asin, MARKETPLACE, count);
    }
  }
}

// Map each product ASIN on the page to the anchor text that names it, so a row
// can show a title instead of a bare ASIN. Best-effort: the first non-trivial
// link text per ASIN wins.
function readProductTitles(root: ParentNode): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const m = (a.getAttribute("href") ?? "").match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    const asin = m?.[1]?.toUpperCase();
    const title = a.textContent?.trim();
    if (asin && title && title.length > 4 && !map.has(asin)) map.set(asin, title);
  }
  return map;
}

function money(cents: number | null, locale: string): string | null {
  if (cents === null) return null;
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100)}`;
  }
}

// The saturation chip's colour: 0 videos is a wide-open spot (green), a crowded
// product warns (red), the middle is neutral. Mirrors the grid badge's scale.
function videoChip(count: number): HTMLElement {
  const cls = count === 0 ? "good" : count > 30 ? "bad" : "";
  const chip = el("span", "", t().radarVideoChip(count));
  chip.style.fontSize = "12px";
  chip.style.fontWeight = "700";
  chip.style.padding = "2px 8px";
  chip.style.borderRadius = "999px";
  chip.style.whiteSpace = "nowrap";
  chip.style.background = cls === "good" ? "#dcfce7" : cls === "bad" ? "#fee2e2" : "rgba(0,0,0,0.06)";
  chip.style.color = cls === "good" ? "#166534" : cls === "bad" ? "#991b1b" : "#374151";
  chip.title = t().radarVideoTitle;
  return chip;
}

function renderRow(row: ProductRow): void {
  const locale = getLocale();
  row.bodyEl.replaceChildren();

  const title = el("div", "", row.title ?? row.asin);
  title.style.fontSize = "13px";
  title.style.fontWeight = "600";
  title.style.color = "#111827";
  title.style.marginBottom = "4px";
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  title.style.whiteSpace = "nowrap";
  row.bodyEl.append(title);

  const facts = el("div");
  facts.style.display = "flex";
  facts.style.flexWrap = "wrap";
  facts.style.alignItems = "center";
  facts.style.gap = "6px";

  const m = row.market;
  if (m) {
    const price = money(m.priceCents, locale);
    if (price) facts.append(factChip(price));
    if (m.estMonthlySales !== null) {
      const rev = money(
        m.priceCents !== null ? m.estMonthlySales * m.priceCents : null,
        locale,
      );
      facts.append(factChip(t().campaignBriefPickEst(String(Math.round(m.estMonthlySales)), rev ?? "?")));
    }
    if (m.boughtPastMonth !== null) facts.append(factChip(t().campaignDetailBought(m.boughtPastMonth)));
  } else {
    facts.append(factChip(t().campaignDetailNoData));
  }
  if (row.videoCount !== null) facts.append(videoChip(row.videoCount));

  row.bodyEl.append(facts);
}

function factChip(text: string): HTMLElement {
  const chip = el("span", "", text);
  chip.style.fontSize = "12px";
  chip.style.fontWeight = "600";
  chip.style.padding = "2px 8px";
  chip.style.borderRadius = "999px";
  chip.style.background = "rgba(0,0,0,0.06)";
  chip.style.color = "#374151";
  chip.style.whiteSpace = "nowrap";
  return chip;
}

function mount(score: CampaignScore, confidence: number, rows: ProductRow[]): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  mountedHost = host;

  const card = el("div");
  card.style.position = "fixed";
  card.style.right = "16px";
  card.style.bottom = "16px";
  card.style.zIndex = "2147483646";
  card.style.width = "min(360px, calc(100vw - 32px))";
  card.style.maxHeight = "70vh";
  card.style.overflowY = "auto";
  card.style.background = "#fff";
  card.style.color = "#111827";
  card.style.borderRadius = "14px";
  card.style.boxShadow = "0 16px 48px rgba(0,0,0,0.28)";
  card.style.padding = "14px 16px";
  card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  // Header: title + score + a close button that dismisses for this view.
  const header = el("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "10px";

  const titleWrap = el("div");
  titleWrap.style.display = "flex";
  titleWrap.style.alignItems = "center";
  titleWrap.style.gap = "10px";
  const scoreBox = el("div", "", String(score.score));
  scoreBox.style.fontSize = "24px";
  scoreBox.style.fontWeight = "800";
  scoreBox.style.lineHeight = "1";
  scoreBox.style.color = BAND_COLOR[score.band];
  const titleText = el("div");
  const h = el("div", "", t().campaignDetailTitle);
  h.style.fontWeight = "800";
  h.style.fontSize = "14px";
  const conf = el("div", "", t().campaignBriefConfidence(confidence));
  conf.style.fontSize = "12px";
  conf.style.color = "#6b7280";
  titleText.append(h, conf);
  titleWrap.append(scoreBox, titleText);

  const close = el("button", "", "✕") as HTMLButtonElement;
  close.type = "button";
  close.setAttribute("aria-label", t().campaignBriefClose);
  close.style.border = "none";
  close.style.background = "transparent";
  close.style.fontSize = "16px";
  close.style.cursor = "pointer";
  close.style.color = "#6b7280";
  close.addEventListener("click", teardown);
  header.append(titleWrap, close);
  card.append(header);

  // Products heading + rows (or an empty note).
  const heading = el("div", "", t().campaignDetailProducts);
  heading.style.fontWeight = "700";
  heading.style.fontSize = "13px";
  heading.style.margin = "14px 0 8px";
  card.append(heading);

  if (rows.length === 0) {
    const empty = el("div", "", t().campaignDetailNoProducts);
    empty.style.fontSize = "13px";
    empty.style.color = "#6b7280";
    card.append(empty);
  } else {
    for (const row of rows) {
      const wrap = el("div");
      wrap.style.padding = "8px 0";
      wrap.style.borderTop = "1px solid rgba(0,0,0,0.08)";
      renderRow(row);
      wrap.append(row.bodyEl);
      card.append(wrap);
    }
  }

  root.append(card);
  document.documentElement.append(host);
}
