import { DEALS_CATALOG, type DealsDict } from "./strings";
import { resolveLocale } from "../i18n";
import { getSettings, patchSettings } from "../storage/store";
import { DEAL_PUSH_CHUNK, DEAL_WORKSPACES } from "../shared/constants";
import {
  sendToBackground,
  type DealSource,
  type EnrichResult,
  type HarvestResult,
  type HudCommandResult,
  type HudStatus,
} from "../shared/messages";
import type { HarvestedDeal } from "../tools/deal-harvester/extract";
import type { ProductRef } from "../transport/hud-commands";
import type { DealFinding, Finding } from "../transport/types";

// The Deal Sites Harvester page. Opened from the extension popup in its own tab.
// It gathers aggregator URLs (curated + saved + pasted), asks the background to
// fetch and parse them, enriches the products through the Creator API, shows a
// review list, records the finds to the dashboard, and pushes the selected
// deals into a Daily Deals workspace in the desktop app.

let D: DealsDict;

type Row = {
  deal: HarvestedDeal;
  title: string | null;
  priceCents: number | null;
  currency: string | null;
  imageUrl: string | null;
  discountPct: number | null;
  commissionRatePct: number | null;
  selected: boolean;
};

let rows: Row[] = [];
let curatedSources: DealSource[] = [];

const root = () => document.getElementById("root") as HTMLElement;

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  D = DEALS_CATALOG[resolveLocale(settings.locale)];
  document.title = `Influencer Butler: ${D.pageTitle}`;
  (document.getElementById("page-title") as HTMLElement).textContent = D.pageTitle;
  curatedSources = await sendToBackground<DealSource[]>({ kind: "GET_DEAL_SOURCES" });
  await render();
}

async function render(): Promise<void> {
  const settings = await getSettings();
  const main = root();
  main.replaceChildren();

  const intro = el("p", "intro");
  intro.textContent = D.pageIntro;
  main.append(intro);

  main.append(await renderSources(settings.dealSources));
  main.append(renderResults());
}

// The sources card: curated toggle, the user's saved list, and a paste box.
let includeCurated = true;

async function renderSources(saved: string[]): Promise<HTMLElement> {
  const card = section(D.sourcesHeading);

  if (curatedSources.length > 0) {
    const row = el("label", "toggle");
    const box = el("input") as HTMLInputElement;
    box.type = "checkbox";
    box.checked = includeCurated;
    box.onchange = () => (includeCurated = box.checked);
    const span = el("span");
    span.textContent = `${D.curatedLabel} (${curatedSources.length})`;
    row.append(box, span);
    card.append(row);
  }

  if (saved.length > 0) {
    const h = el("p", "muted small");
    h.textContent = D.savedLabel;
    card.append(h);
    const list = el("ul", "saved-list");
    for (const url of saved) {
      const li = el("li");
      const u = el("span", "url");
      u.textContent = url;
      const rm = el("button", "ghost small");
      rm.textContent = D.remove;
      rm.onclick = async () => {
        const next = (await getSettings()).dealSources.filter((s) => s !== url);
        await patchSettings({ dealSources: next });
        await render();
      };
      li.append(u, rm);
      list.append(li);
    }
    card.append(list);
  }

  const label = el("label", "field");
  const span = el("span");
  span.textContent = D.pasteLabel;
  const paste = el("textarea", "paste") as HTMLTextAreaElement;
  paste.id = "paste";
  paste.placeholder = D.pastePlaceholder;
  label.append(span, paste);
  card.append(label);

  const actions = el("div", "row");
  const saveBtn = el("button", "ghost");
  saveBtn.textContent = D.addSaved;
  saveBtn.onclick = async () => {
    const urls = parseUrls(paste.value);
    if (urls.length === 0) return;
    const current = (await getSettings()).dealSources;
    const merged = [...new Set([...current, ...urls])];
    await patchSettings({ dealSources: merged });
    paste.value = "";
    await render();
  };

  const harvestBtn = el("button", "primary");
  harvestBtn.textContent = D.harvest;
  const status = el("span", "muted small");
  status.id = "harvest-status";
  harvestBtn.onclick = () => void runHarvest(harvestBtn, status, paste);

  actions.append(saveBtn, harvestBtn, status);
  card.append(actions);
  return card;
}

async function runHarvest(
  btn: HTMLButtonElement,
  status: HTMLElement,
  paste: HTMLTextAreaElement,
): Promise<void> {
  const settings = await getSettings();
  const urls = [
    ...(includeCurated ? curatedSources.map((s) => s.url) : []),
    ...settings.dealSources,
    ...parseUrls(paste.value),
  ];
  const unique = [...new Set(urls)];
  if (unique.length === 0) {
    status.textContent = D.addUrlsFirst;
    return;
  }

  // Ask for permission to read the chosen sites (must be from this click).
  const granted = await requestOrigins(unique);
  if (!granted) {
    status.textContent = D.permissionDenied;
    return;
  }

  btn.disabled = true;
  btn.textContent = D.harvesting;
  status.textContent = D.harvesting;
  try {
    const result = await sendToBackground<HarvestResult>({ kind: "HARVEST_DEAL_SITES", urls: unique });
    rows = result.deals.map((deal) => ({
      deal,
      title: null,
      priceCents: null,
      currency: null,
      imageUrl: null,
      discountPct: null,
      commissionRatePct: null,
      selected: true,
    }));
    renderResultsInto();

    if (rows.length > 0) {
      status.textContent = D.enriching;
      await enrich();
      await recordFindings();
    }
    renderResultsInto();
    status.textContent = harvestSummary(result);
  } finally {
    btn.disabled = false;
    btn.textContent = D.harvest;
  }
}

function harvestSummary(result: HarvestResult): string {
  const parts: string[] = [];
  if (result.capped) parts.push(D.cappedNote);
  return parts.join(" ");
}

// Enrich the harvested ASINs through the Creator API for title, price, image.
async function enrich(): Promise<void> {
  const asins = [...new Set(rows.map((r) => r.deal.asin))];
  const marketplaces = [...new Set(rows.map((r) => r.deal.marketplace))];
  const res = await sendToBackground<EnrichResult>({ kind: "ENRICH_PRODUCTS", asins, marketplaces });
  if (!res.ok || !res.configured) return; // not signed in / no Creator API: keep raw rows

  const byKey = new Map<string, (typeof res.items)[number]["results"][number]>();
  for (const item of res.items) {
    for (const p of item.results) {
      if (p.found && p.asin) byKey.set(`${p.marketplace}:${p.asin}`, p);
    }
  }
  for (const row of rows) {
    const p = byKey.get(`${row.deal.marketplace}:${row.deal.asin}`);
    if (!p) continue;
    row.title = p.title;
    row.priceCents = p.priceCents;
    row.currency = p.currency;
    row.imageUrl = p.imageUrl;
  }
}

// Record every harvested product to the dashboard (one deal finding each). The
// background queues them and syncs with the license key; unsent finds ride the
// queue until the next flush, exactly like the other tools.
async function recordFindings(): Promise<void> {
  const detectedAt = new Date().toISOString();
  for (const row of rows) {
    const finding: DealFinding = {
      type: "deal",
      asin: row.deal.asin,
      marketplace: row.deal.marketplace,
      title: row.title ?? undefined,
      priceCents: row.priceCents,
      discountPct: row.discountPct,
      commissionRatePct: row.commissionRatePct,
      currency: row.currency ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
      sourceUrl: row.deal.sourceUrl,
      promoCode: row.deal.promoCode,
      detectedAt,
    };
    void sendToBackground<void>({ kind: "RECORD_FINDING", finding: finding as Finding }).catch(() => {
      // background waking; the client-side queue resends on the next flush
    });
  }
}

function renderResults(): HTMLElement {
  const card = section(D.resultsHeading);
  card.id = "results-card";
  const holder = el("div");
  holder.id = "results-holder";
  card.append(holder);
  return card;
}

function renderResultsInto(): void {
  const holder = document.getElementById("results-holder");
  if (!holder) return;
  holder.replaceChildren();

  if (rows.length === 0) {
    const p = el("p", "muted small");
    p.textContent = D.noResults;
    holder.append(p);
    return;
  }

  // Select-all row.
  const controls = el("div", "row");
  const allBox = el("input") as HTMLInputElement;
  allBox.type = "checkbox";
  allBox.checked = rows.every((r) => r.selected);
  allBox.onchange = () => {
    for (const r of rows) r.selected = allBox.checked;
    renderResultsInto();
  };
  const allLabel = el("label", "toggle");
  const allSpan = el("span");
  allSpan.textContent = D.selectAll;
  allLabel.append(allBox, allSpan);
  controls.append(allLabel);
  holder.append(controls);

  const scroll = el("div", "deals-scroll");
  const table = el("table", "deals-table");
  const thead = el("thead");
  const htr = el("tr");
  for (const label of ["", D.colProduct, D.colPrice, D.colDiscount, D.colCommission, D.colSource]) {
    const th = el("th");
    th.textContent = label;
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);

  const tbody = el("tbody");
  for (const row of rows) tbody.append(renderRow(row));
  table.append(tbody);
  scroll.append(table);
  holder.append(scroll);

  holder.append(renderSend());
}

function renderRow(row: Row): HTMLElement {
  const tr = el("tr");

  const pick = el("td");
  const box = el("input") as HTMLInputElement;
  box.type = "checkbox";
  box.checked = row.selected;
  box.onchange = () => (row.selected = box.checked);
  pick.append(box);
  tr.append(pick);

  const prod = el("td", "prod");
  const link = el("a") as HTMLAnchorElement;
  link.href = productUrl(row.deal.asin, row.deal.marketplace);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = row.title ?? row.deal.asin;
  prod.append(link);
  if (row.deal.promoCode) {
    const code = el("span", "chip-code");
    code.textContent = row.deal.promoCode;
    prod.append(code);
  }
  tr.append(prod);

  tr.append(numCell(formatPrice(row.priceCents, row.currency)));
  tr.append(numCell(row.discountPct == null ? "-" : `${row.discountPct}%`));
  tr.append(numCell(row.commissionRatePct == null ? "-" : `${row.commissionRatePct}%`));

  const src = el("td");
  src.textContent = hostOf(row.deal.sourceUrl);
  tr.append(src);
  return tr;
}

function renderSend(): HTMLElement {
  const wrap = el("div", "card");
  const h = el("h2", "cat");
  h.textContent = D.sendHeading;
  wrap.append(h);

  const row = el("div", "row");
  const label = el("span", "muted small");
  label.textContent = D.workspaceLabel;
  const picker = el("select") as HTMLSelectElement;
  picker.id = "workspace-picker";
  wrap.append(row);

  const sendBtn = el("button", "primary");
  sendBtn.textContent = D.sendSelected;
  const status = el("span", "muted small");

  row.append(label, picker, sendBtn, status);

  // Populate the workspace picker from the running app, else the hint list.
  void sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" }).then((hud) => {
    const workspaces = hud.dealWorkspaces?.length ? hud.dealWorkspaces : DEAL_WORKSPACES;
    for (const w of workspaces) {
      const opt = el("option") as HTMLOptionElement;
      opt.value = w.key;
      opt.textContent = w.label;
      picker.append(opt);
    }
    if (!hud.connected) status.textContent = D.appNotConnected;
  });

  sendBtn.onclick = () => void sendSelected(picker, sendBtn, status);
  return wrap;
}

async function sendSelected(
  picker: HTMLSelectElement,
  btn: HTMLButtonElement,
  status: HTMLElement,
): Promise<void> {
  const selected = rows.filter((r) => r.selected);
  if (selected.length === 0) {
    status.textContent = D.nothingSelected;
    return;
  }
  const workspace = picker.value || "default";
  const products: ProductRef[] = selected.map(toProductRef);

  btn.disabled = true;
  status.textContent = D.sending;
  let sent = 0;
  let lastMessage = "";
  for (let i = 0; i < products.length; i += DEAL_PUSH_CHUNK) {
    const chunk = products.slice(i, i + DEAL_PUSH_CHUNK);
    const result = await sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "deal.push.batch", workspace, products: chunk },
    });
    if (!result.ok) {
      lastMessage = result.message ?? D.appNotConnected;
      break;
    }
    sent += chunk.length;
  }
  btn.disabled = false;
  status.textContent = sent > 0 ? `${D.sentToApp} (${sent})` : lastMessage || D.appNotConnected;
}

function toProductRef(row: Row): ProductRef {
  return {
    asin: row.deal.asin,
    marketplace: row.deal.marketplace,
    title: row.title ?? undefined,
    priceCents: row.priceCents,
    currency: row.currency ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    commissionRatePct: row.commissionRatePct,
  };
}

// Request host permission for the origins of the given URLs, from the current
// user gesture. Returns true when granted (or nothing new was needed).
async function requestOrigins(urls: string[]): Promise<boolean> {
  const origins = [
    ...new Set(
      urls
        .map((u) => {
          try {
            return `${new URL(u).origin}/*`;
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ];
  if (origins.length === 0) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

function parseUrls(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

function productUrl(asin: string, marketplace: string): string {
  return `https://www.${marketplace}/dp/${asin}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "-";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function numCell(text: string): HTMLElement {
  const td = el("td", "num");
  td.textContent = text;
  return td;
}

function section(heading: string): HTMLElement {
  const card = el("section", "card");
  const h = el("h2", "cat");
  h.textContent = heading;
  card.append(h);
  return card;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
