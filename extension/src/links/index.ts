import { LINKS_CATALOG, type LinksDict } from "./strings";
import { resolveLocale } from "../i18n";
import { getSettings, patchSettings } from "../storage/store";
import {
  sendToBackground,
  type AuthStatus,
  type LinkPixel,
  type LinkStatsRange,
  type ListResult,
  type PixelsResult,
  type RepointResult,
  type RowBadge,
  type RowBadgesResult,
  type RowEnrichRef,
  type SignInResult,
  type StatsResult,
} from "../shared/messages";
import type { LinkRow } from "../integrations/ib-links-client";

// The Link Butler (Ledger) page. Opened from the extension popup in its own tab.
// It reads the branded-link worker through the background (the license key never
// reaches this page): click analytics (the Ledger), the link registry with
// self-heal repoint, the retargeting-pixel form (the Doorbell), and the
// smart-routing toggle.

let D: LinksDict;
let range: LinkStatsRange = "30d";

const root = () => document.getElementById("root") as HTMLElement;

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  D = LINKS_CATALOG[resolveLocale(settings.locale)];
  document.title = `Influencer Butler: ${D.pageTitle}`;
  (document.getElementById("page-title") as HTMLElement).textContent = D.pageTitle;

  const auth = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
  if (!auth.signedIn) {
    renderSignedOut();
    return;
  }
  await render();
}

// Signed-out gate: an inline connect form so the user can enter their license
// key right here instead of being sent to hunt for the popup. Uses the same
// SIGN_IN background message the popup does; the key never persists on this page.
// On success it re-renders straight into the Ledger.
function renderSignedOut(): void {
  const card = section(D.connectHeading);
  card.append(note(D.signedOut));

  const row = el("div", "connect-row");
  const input = el("input", "connect-input") as HTMLInputElement;
  input.type = "password";
  input.autocomplete = "off";
  input.placeholder = D.connectPlaceholder;
  const btn = el("button", "primary", D.connectButton) as HTMLButtonElement;
  row.append(input, btn);
  card.append(row);

  const error = el("p", "error");
  error.hidden = true;
  card.append(error);

  const trial = el("p", "muted small");
  trial.append(document.createTextNode(`${D.noKeyYet} `));
  const link = el("a") as HTMLAnchorElement;
  link.href = "https://www.influencerbutler.com/pricing";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = D.startTrial;
  trial.append(link);
  card.append(trial);

  const submit = async (): Promise<void> => {
    const licenseKey = input.value.trim();
    if (!licenseKey) return;
    btn.disabled = true;
    error.hidden = true;
    const result = await sendToBackground<SignInResult>({ kind: "SIGN_IN", licenseKey });
    btn.disabled = false;
    if (result.ok) {
      await render();
    } else {
      error.textContent = result.error ?? D.connectError;
      error.hidden = false;
    }
  };
  btn.onclick = () => void submit();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submit();
  });

  root().replaceChildren(card);
  input.focus();
}

async function render(): Promise<void> {
  const main = root();
  main.replaceChildren();

  const intro = el("p", "intro");
  intro.textContent = D.pageIntro;
  main.append(intro);

  main.append(renderLedger());
  main.append(renderRegistry());
  main.append(await renderPixels());
  main.append(await renderSettings());

  void loadLedger();
  void loadRegistry(null, true);
}

// ---- Ledger -----------------------------------------------------------------

function renderLedger(): HTMLElement {
  const card = section(D.ledgerHeading);

  const ranges: Array<{ key: LinkStatsRange; label: string }> = [
    { key: "today", label: D.rangeToday },
    { key: "7d", label: D.range7d },
    { key: "30d", label: D.range30d },
    { key: "90d", label: D.range90d },
  ];
  const picker = el("div", "range-row");
  for (const r of ranges) {
    const btn = el("button", `range-btn${r.key === range ? " active" : ""}`);
    btn.textContent = r.label;
    btn.onclick = () => {
      range = r.key;
      for (const other of picker.querySelectorAll("button")) other.classList.remove("active");
      btn.classList.add("active");
      void loadLedger();
    };
    picker.append(btn);
  }
  card.append(picker);

  const holder = el("div");
  holder.id = "ledger-holder";
  holder.append(note(D.loading));
  card.append(holder);
  return card;
}

async function loadLedger(): Promise<void> {
  const holder = document.getElementById("ledger-holder");
  if (!holder) return;
  holder.replaceChildren(note(D.loading));
  const result = await sendToBackground<StatsResult>({ kind: "LINK_STATS", range });
  if (!result.ok) {
    holder.replaceChildren(note(result.code === "upgrade_required" ? D.upgradeNeeded : D.couldNotLoad));
    return;
  }
  const s = result.stats;
  holder.replaceChildren();

  const tiles = el("div", "tiles");
  tiles.append(tile(String(s.totalClicks), `${D.totalClicks} (${deltaText(s.totalClicks, s.prevClicks)})`));
  tiles.append(tile(String(s.linksCreated), D.linksCreated));
  holder.append(tiles);

  if (s.totalClicks === 0) {
    holder.append(note(D.noClicks));
  } else {
    holder.append(sparkline(s.series.map((p) => p.clicks)));
  }

  if (s.topLinks.length > 0) {
    holder.append(subHeading(D.topLinksHeading));
    const scroll = el("div", "links-scroll");
    const table = el("table", "links-table");
    const thead = el("thead");
    const htr = el("tr");
    for (const label of [D.colLink, D.colClicks, D.colTarget]) {
      const th = el("th");
      th.textContent = label;
      htr.append(th);
    }
    thead.append(htr);
    table.append(thead);
    const tbody = el("tbody");
    // Handles for the async enrichment pass: fill each thumbnail and CC/SPCC/rate
    // strip once the batch returns, keyed by the row's ASIN.
    const handles: Array<{ asin: string; thumb: HTMLImageElement; signals: HTMLElement }> = [];
    for (const link of s.topLinks) {
      const tr = el("tr");

      // Link cell: product thumbnail + the short link.
      const linkTd = el("td", "link");
      const wrap = el("div", "cell-link");
      const thumb = makeThumb(null, link.label || link.slug);
      const a = el("a") as HTMLAnchorElement;
      a.href = link.shortUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link.label || link.slug;
      wrap.append(thumb, a);
      linkTd.append(wrap);
      tr.append(linkTd);

      const clicks = el("td", "num");
      clicks.textContent = String(link.clicks);
      tr.append(clicks);

      // Target cell: the ASIN/host, with the campaign signals below it.
      const target = el("td", "target");
      const targetText = el("div", "target-text");
      targetText.textContent = link.asin || hostOf(link.targetUrl ?? "");
      const signals = el("div", "row-signals");
      target.append(targetText, signals);
      tr.append(target);

      tbody.append(tr);
      handles.push({ asin: (link.asin ?? "").toUpperCase(), thumb, signals });
    }
    table.append(tbody);
    scroll.append(table);
    holder.append(scroll);

    // Enrich after the table is drawn so it is interactive immediately.
    void enrichLinks(
      s.topLinks.map((l) => ({ asin: l.asin, marketplace: marketplaceOf(null, l.targetUrl) })),
    ).then((badges) => {
      for (const h of handles) {
        const badge = badges[h.asin];
        if (!badge) continue;
        if (badge.imageUrl) setThumb(h.thumb, badge.imageUrl);
        fillSignals(h.signals, badge);
      }
    });
  }

  const breakdowns = el("div", "breakdowns");
  breakdowns.append(breakdown(D.byCountry, s.countries));
  breakdowns.append(breakdown(D.byDevice, s.devices));
  breakdowns.append(breakdown(D.bySurface, s.surfaces));
  holder.append(breakdowns);
}

function deltaText(current: number, previous: number): string {
  if (previous <= 0) return D.vsPrevious;
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% ${D.vsPrevious}`;
}

// A minimal inline-SVG sparkline of the daily click series. No chart library.
function sparkline(values: number[]): HTMLElement {
  const wrap = el("div", "sparkline");
  if (values.length < 2) return wrap;
  const w = 600;
  const h = 60;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("spark-svg");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  poly.setAttribute("points", points);
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "#e8730a");
  poly.setAttribute("stroke-width", "2");
  poly.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(poly);
  wrap.append(svg);
  return wrap;
}

function breakdown(title: string, rows: Array<{ label: string; clicks: number }>): HTMLElement {
  const box = el("div", "breakdown");
  const h = el("h4");
  h.textContent = title;
  box.append(h);
  if (rows.length === 0) {
    box.append(note("-"));
    return box;
  }
  const ul = el("ul", "bd-list");
  for (const r of rows.slice(0, 6)) {
    const li = el("li");
    const label = el("span", "bd-label");
    label.textContent = r.label;
    const val = el("b");
    val.textContent = String(r.clicks);
    li.append(label, val);
    ul.append(li);
  }
  box.append(ul);
  return box;
}

// ---- Registry ---------------------------------------------------------------

// Accumulated registry state. The worker pages the list by cursor; we keep every
// loaded row plus its enrichment badge so the filter bar can narrow the loaded
// set client-side and "Load more" keeps pulling further pages.
let regRows: LinkRow[] = [];
let regBadges: Record<string, RowBadge> = {};
let regCursor: string | null = null;
const regFilter = {
  q: "",
  campaign: "all" as "all" | "cc" | "spcc" | "any",
  marketplace: "all",
  health: "all" as "all" | "repointed" | "original",
};

function renderRegistry(): HTMLElement {
  // Reset state on a fresh page render so a re-render never doubles the list.
  regRows = [];
  regBadges = {};
  regCursor = null;
  regFilter.q = "";
  regFilter.campaign = "all";
  regFilter.marketplace = "all";
  regFilter.health = "all";

  const card = section(D.registryHeading);
  const intro = el("p", "muted small");
  intro.textContent = D.registryIntro;
  card.append(intro);
  card.append(buildRegFilterBar());
  const holder = el("div");
  holder.id = "registry-holder";
  holder.append(note(D.loading));
  card.append(holder);
  return card;
}

// The search + campaign + marketplace + health controls. Each re-runs the
// client-side filter over the already-loaded rows.
function buildRegFilterBar(): HTMLElement {
  const bar = el("div", "reg-filter-bar");

  const search = el("input", "reg-search") as HTMLInputElement;
  search.type = "search";
  search.placeholder = D.filterSearchPlaceholder;
  search.oninput = () => {
    regFilter.q = search.value.trim().toLowerCase();
    renderRegistryList();
  };

  const campaign = selectFrom("reg-select", [
    ["all", D.filterCampaignAll],
    ["cc", D.filterCampaignCc],
    ["spcc", D.filterCampaignSpcc],
    ["any", D.filterCampaignAny],
  ]);
  campaign.onchange = () => {
    regFilter.campaign = campaign.value as typeof regFilter.campaign;
    renderRegistryList();
  };

  const marketplace = el("select", "reg-select") as HTMLSelectElement;
  marketplace.id = "reg-mkt-select";
  rebuildMarketplaceOptions(marketplace);
  marketplace.onchange = () => {
    regFilter.marketplace = marketplace.value;
    renderRegistryList();
  };

  const health = selectFrom("reg-select", [
    ["all", D.filterHealthAll],
    ["repointed", D.filterHealthRepointed],
    ["original", D.filterHealthOriginal],
  ]);
  health.onchange = () => {
    regFilter.health = health.value as typeof regFilter.health;
    renderRegistryList();
  };

  bar.append(search, campaign, marketplace, health);
  return bar;
}

// Populate the marketplace dropdown with "All" plus the distinct marketplaces
// present in the loaded rows, preserving the current selection when still valid.
function rebuildMarketplaceOptions(select: HTMLSelectElement): void {
  const current = select.value || "all";
  const hosts = new Set<string>();
  for (const link of regRows) {
    const host = marketplaceOf(link.marketplace, link.targetUrl);
    if (host) hosts.add(host);
  }
  select.replaceChildren();
  const allOpt = el("option") as HTMLOptionElement;
  allOpt.value = "all";
  allOpt.textContent = D.filterMarketplaceAll;
  select.append(allOpt);
  for (const host of Array.from(hosts).sort()) {
    const opt = el("option") as HTMLOptionElement;
    opt.value = host;
    opt.textContent = MARKETPLACE_CODE[host] ? `${MARKETPLACE_CODE[host]} (${host})` : host;
    select.append(opt);
  }
  select.value = current === "all" || hosts.has(current) ? current : "all";
}

async function loadRegistry(cursor: string | null, replace: boolean): Promise<void> {
  const holder = document.getElementById("registry-holder");
  if (!holder) return;
  if (replace) {
    regRows = [];
    regBadges = {};
    regCursor = null;
    holder.replaceChildren(note(D.loading));
  }

  const result = await sendToBackground<ListResult>({ kind: "LINK_LIST", cursor });
  if (!result.ok) {
    if (replace) {
      holder.replaceChildren(note(result.code === "upgrade_required" ? D.upgradeNeeded : D.couldNotLoad));
    }
    return;
  }

  regRows.push(...result.links);
  regCursor = result.nextCursor ?? null;

  const mktSelect = document.getElementById("reg-mkt-select") as HTMLSelectElement | null;
  if (mktSelect) rebuildMarketplaceOptions(mktSelect);

  renderRegistryList();

  // Enrich this page's ASINs, merge into the shared badge map, then repaint so
  // thumbnails, chips, and any active campaign/search filter reflect the data.
  const badges = await enrichLinks(
    result.links.map((l) => ({ asin: l.asin, marketplace: marketplaceOf(l.marketplace, l.targetUrl) })),
  );
  Object.assign(regBadges, badges);
  renderRegistryList();
}

// Draw the filtered registry rows plus the "Load more" control. Rebuilt whenever
// a page loads, enrichment lands, or a filter changes.
function renderRegistryList(): void {
  const holder = document.getElementById("registry-holder");
  if (!holder) return;
  holder.replaceChildren();

  if (regRows.length === 0) {
    holder.append(note(D.noLinks));
    return;
  }

  const filtered = regRows.filter(matchesFilter);
  if (filtered.length === 0) {
    holder.append(note(D.noMatches));
  } else {
    const list = el("ul", "reg-list");
    for (const link of filtered) list.append(regItem(link));
    holder.append(list);
  }

  if (regCursor) {
    const more = el("button", "ghost load-more");
    more.textContent = D.loadMore;
    more.onclick = () => {
      more.disabled = true;
      void loadRegistry(regCursor, false);
    };
    holder.append(more);
  }
}

function matchesFilter(link: LinkRow): boolean {
  const asin = (link.asin ?? "").toUpperCase();
  const badge = regBadges[asin];

  if (regFilter.q) {
    const hay = [link.label ?? "", badge?.title ?? "", link.asin ?? "", link.targetUrl ?? ""]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(regFilter.q)) return false;
  }

  if (regFilter.campaign !== "all") {
    const cc = badge?.cc ?? false;
    const spcc = badge?.spcc ?? false;
    if (regFilter.campaign === "cc" && !cc) return false;
    if (regFilter.campaign === "spcc" && !spcc) return false;
    if (regFilter.campaign === "any" && !cc && !spcc) return false;
  }

  if (regFilter.marketplace !== "all" && marketplaceOf(link.marketplace, link.targetUrl) !== regFilter.marketplace) {
    return false;
  }

  if (regFilter.health === "repointed" && !link.repointedAt) return false;
  if (regFilter.health === "original" && link.repointedAt) return false;

  return true;
}

// One rich registry row: product thumbnail, title (enriched or fallback), a
// brand / ASIN / marketplace sub-line, the short link and raw target, the
// CC / SPCC / commission signals, and the repoint action.
function regItem(link: LinkRow): HTMLElement {
  const li = el("li", "reg-item");
  const asin = (link.asin ?? "").toUpperCase();
  const badge = regBadges[asin];

  const thumb = makeThumb(badge?.imageUrl ?? null, link.label || link.slug);

  const body = el("div", "reg-body");

  const title = el("div", "reg-title");
  title.textContent = badge?.title || link.label || link.asin || D.untitledLink;
  body.append(title);

  const host = marketplaceOf(link.marketplace, link.targetUrl);
  const subParts: string[] = [];
  if (badge?.brand) subParts.push(badge.brand);
  if (link.asin) subParts.push(link.asin);
  const pill = mktPill(host);
  if (subParts.length || pill) {
    const sub = el("div", "reg-sub");
    if (subParts.length) sub.append(document.createTextNode(subParts.join(" · ")));
    if (pill) {
      if (subParts.length) sub.append(document.createTextNode(" "));
      sub.append(pill);
    }
    body.append(sub);
  }

  const main = el("div", "reg-main");
  const a = el("a", "reg-short") as HTMLAnchorElement;
  a.href = link.shortUrl;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = link.shortUrl.replace(/^https?:\/\//, "");
  main.append(a);
  body.append(main);

  if (link.targetUrl) {
    const target = el("div", "reg-target");
    target.textContent = link.targetUrl;
    body.append(target);
  }

  if (badge && (badge.cc || badge.spcc || badge.ratePct != null)) {
    const signals = el("div", "row-signals");
    fillSignals(signals, badge);
    body.append(signals);
  }

  if (link.repointedAt) {
    const rep = el("span", "reg-repointed");
    rep.textContent = D.repointedNote(new Date(link.repointedAt).toLocaleDateString());
    body.append(rep);
  }

  const actions = el("div", "reg-actions");
  const repointBtn = el("button", "ghost small");
  repointBtn.textContent = D.repoint;
  const status = el("span", "muted small");
  repointBtn.onclick = () => void doRepoint(link.slug, link.asin, link.marketplace, status);
  actions.append(repointBtn, status);
  body.append(actions);

  li.append(thumb, body);
  return li;
}

async function doRepoint(
  slug: string,
  asin: string | null,
  marketplace: string | null,
  status: HTMLElement,
): Promise<void> {
  const url = window.prompt(D.repointPrompt);
  if (url == null) return;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    status.textContent = D.repointBadUrl;
    return;
  }
  status.textContent = D.working;
  const result = await sendToBackground<RepointResult>({
    kind: "LINK_REPOINT",
    slug,
    url: trimmed,
    asin: asin ?? undefined,
    marketplace: marketplace ?? undefined,
  });
  if (result.ok) {
    status.textContent = result.unchanged ? D.repointUnchanged : D.repointDone;
    if (!result.unchanged) void loadRegistry(null, true);
    return;
  }
  status.textContent =
    result.code === "target_in_use"
      ? D.repointInUse
      : result.code === "not_found"
        ? D.repointNotFound
        : result.error;
}

// ---- Pixels (the Doorbell) --------------------------------------------------

let pixelRows: LinkPixel[] = [];

async function renderPixels(): Promise<HTMLElement> {
  const card = section(D.pixelsHeading);
  const intro = el("p", "muted small");
  intro.textContent = D.pixelsIntro;
  card.append(intro);

  pixelRows = await sendToBackground<LinkPixel[]>({ kind: "LINK_PIXELS_GET" });

  const holder = el("div");
  holder.id = "pixels-holder";
  card.append(holder);

  const actions = el("div", "row");
  const addBtn = el("button", "ghost");
  addBtn.textContent = D.addPixel;
  addBtn.onclick = () => {
    pixelRows.push({ platform: "meta", id: "" });
    renderPixelRows();
  };
  const saveBtn = el("button", "primary");
  saveBtn.textContent = D.savePixels;
  const status = el("span", "muted small");
  saveBtn.onclick = () => void savePixels(saveBtn, status);
  actions.append(addBtn, saveBtn, status);
  card.append(actions);

  renderPixelRows();
  return card;
}

function renderPixelRows(): void {
  const holder = document.getElementById("pixels-holder");
  if (!holder) return;
  holder.replaceChildren();
  pixelRows.forEach((pixel, index) => {
    const row = el("div", "pixel-row");

    const platform = el("select") as HTMLSelectElement;
    for (const p of ["meta", "google", "tiktok"] as const) {
      const opt = el("option") as HTMLOptionElement;
      opt.value = p;
      opt.textContent = p;
      if (p === pixel.platform) opt.selected = true;
      platform.append(opt);
    }
    platform.onchange = () => (pixelRows[index]!.platform = platform.value as LinkPixel["platform"]);

    const id = el("input") as HTMLInputElement;
    id.type = "text";
    id.value = pixel.id;
    id.placeholder = D.pixelIdPlaceholder;
    id.oninput = () => (pixelRows[index]!.id = id.value.trim());

    const name = el("input") as HTMLInputElement;
    name.type = "text";
    name.value = pixel.name ?? "";
    name.placeholder = D.pixelNamePlaceholder;
    name.oninput = () => (pixelRows[index]!.name = name.value);

    const remove = el("button", "ghost small");
    remove.textContent = D.removePixel;
    remove.onclick = () => {
      pixelRows.splice(index, 1);
      renderPixelRows();
    };

    row.append(platform, id, name, remove);
    holder.append(row);
  });
}

async function savePixels(btn: HTMLButtonElement, status: HTMLElement): Promise<void> {
  // Drop empty-id rows; an empty list clears pixels on the worker.
  const pixels = pixelRows.filter((p) => p.id.trim());
  btn.disabled = true;
  status.textContent = D.working;
  const result = await sendToBackground<PixelsResult>({ kind: "LINK_PIXELS_SAVE", pixels });
  btn.disabled = false;
  if (result.ok) {
    pixelRows = result.pixels;
    renderPixelRows();
    status.textContent = result.pixels.length ? D.pixelsSaved : D.pixelsCleared;
  } else {
    status.textContent = result.code === "upgrade_required" ? D.upgradeNeeded : D.pixelsFailed;
  }
}

// ---- Settings ---------------------------------------------------------------

async function renderSettings(): Promise<HTMLElement> {
  const card = section(D.settingsHeading);
  const settings = await getSettings();

  const label = el("label", "row toggle");
  const box = el("input") as HTMLInputElement;
  box.type = "checkbox";
  box.checked = settings.linkButler.smartRouting;
  box.onchange = async () => {
    const current = await getSettings();
    await patchSettings({ linkButler: { ...current.linkButler, smartRouting: box.checked } });
  };
  const span = el("span");
  span.textContent = D.smartRoutingLabel;
  label.append(box, span);
  card.append(label);

  const help = el("p", "muted small");
  help.textContent = D.smartRoutingHelp;
  card.append(help);
  return card;
}

// ---- small helpers ----------------------------------------------------------

function tile(value: string, label: string): HTMLElement {
  const t = el("div", "tile");
  const v = el("div", "tile-value");
  v.textContent = value;
  const l = el("div", "tile-label");
  l.textContent = label;
  t.append(v, l);
  return t;
}

function subHeading(text: string): HTMLElement {
  return el("h3", "sub", text);
}

// ---- Product + campaign enrichment ------------------------------------------
//
// The Top links table and the My links registry both show a product thumbnail,
// title, brand, and the CC / SPCC / commission signals the popup already renders.
// All of it comes from one background call (ENRICH_ROWS -> enrichRows): CC/SPCC
// membership from the local bloom filters, commission from the cc-rates join,
// and image/title/brand from the Creator API. Link rows are never persisted
// (source "link"), and a signed-out or unconfigured user still gets the chips.

const ASIN_RE = /^[A-Z0-9]{10}$/;

// Compact marketplace codes for the flag pill, keyed by the bare Amazon host
// (the same form the link record and CREATOR_API_MARKETPLACES use).
const MARKETPLACE_CODE: Record<string, string> = {
  "amazon.com": "US",
  "amazon.co.uk": "UK",
  "amazon.ca": "CA",
  "amazon.com.au": "AU",
  "amazon.de": "DE",
  "amazon.fr": "FR",
  "amazon.it": "IT",
  "amazon.es": "ES",
  "amazon.co.jp": "JP",
  "amazon.in": "IN",
  "amazon.com.mx": "MX",
};

// The marketplace (bare hostname, e.g. "amazon.co.uk") for a link: its own field
// when present, else derived from the target URL host. Empty when neither is an
// Amazon host, in which case image enrichment simply finds nothing for the row.
function marketplaceOf(marketplace: string | null | undefined, targetUrl: string | null | undefined): string {
  if (marketplace) return marketplace;
  const host = hostOf(targetUrl ?? "");
  return host.includes("amazon.") ? host : "";
}

// Batch-enrich links by ASIN + marketplace, de-duplicated by ASIN. Returns an
// ASIN-keyed badge map; a failed round-trip yields an empty map so callers keep
// their plain rows.
async function enrichLinks(rows: Array<{ asin: string | null; marketplace: string }>): Promise<Record<string, RowBadge>> {
  const refs: RowEnrichRef[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const asin = (r.asin ?? "").toUpperCase();
    if (!ASIN_RE.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    refs.push({ asin, marketplace: r.marketplace, source: "link", needsImage: true });
  }
  if (refs.length === 0) return {};
  try {
    const { badges } = await sendToBackground<RowBadgesResult>({ kind: "ENRICH_ROWS", refs });
    return badges;
  } catch {
    return {};
  }
}

// A 34px product thumbnail; a neutral placeholder box until (or unless) an image
// URL is known. A broken URL falls back to the placeholder.
function makeThumb(imageUrl: string | null, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = imageUrl ? "row-thumb" : "row-thumb placeholder";
  img.loading = "lazy";
  img.alt = alt;
  if (imageUrl) img.src = imageUrl;
  img.onerror = () => {
    img.removeAttribute("src");
    img.classList.add("placeholder");
  };
  return img;
}

function setThumb(img: HTMLImageElement, imageUrl: string): void {
  img.src = imageUrl;
  img.classList.remove("placeholder");
}

function makeChip(kind: "cc" | "spcc", label: string): HTMLElement {
  return el("span", `row-chip ${kind}`, label);
}

function makeRatePill(label: string): HTMLElement {
  return el("span", "row-rate", label);
}

// A small marketplace flag (US / UK / DE ...). Null for a non-Amazon or unknown
// host so the caller can omit it.
function mktPill(host: string): HTMLElement | null {
  if (!host) return null;
  const pill = el("span", "mkt-pill", MARKETPLACE_CODE[host] ?? host.replace(/^www\./, ""));
  pill.title = host;
  return pill;
}

// Fill a signals strip from a badge: CC, SPCC, then commission (Orders Butler
// order). Clears the strip first so a re-render never stacks duplicates.
function fillSignals(strip: HTMLElement, badge: RowBadge): void {
  strip.replaceChildren();
  if (badge.cc) strip.append(makeChip("cc", D.chipCc));
  if (badge.spcc) strip.append(makeChip("spcc", D.chipSpcc));
  if (badge.ratePct != null) strip.append(makeRatePill(D.campaignRate(badge.ratePct)));
}

// Build a <select> from [value, label] pairs.
function selectFrom(className: string, options: ReadonlyArray<readonly [string, string]>): HTMLSelectElement {
  const select = el("select", className) as HTMLSelectElement;
  for (const [value, label] of options) {
    const opt = el("option") as HTMLOptionElement;
    opt.value = value;
    opt.textContent = label;
    select.append(opt);
  }
  return select;
}

function note(text: string): HTMLElement {
  return el("p", "muted small", text);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
