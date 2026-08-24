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
  type SignInResult,
  type StatsResult,
} from "../shared/messages";

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
    for (const link of s.topLinks) {
      const tr = el("tr");
      tr.append(linkCell(link.shortUrl, link.label || link.slug));
      const clicks = el("td", "num");
      clicks.textContent = String(link.clicks);
      tr.append(clicks);
      const target = el("td", "target");
      target.textContent = link.asin || hostOf(link.targetUrl ?? "");
      tr.append(target);
      tbody.append(tr);
    }
    table.append(tbody);
    scroll.append(table);
    holder.append(scroll);
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

function renderRegistry(): HTMLElement {
  const card = section(D.registryHeading);
  const intro = el("p", "muted small");
  intro.textContent = D.registryIntro;
  card.append(intro);
  const holder = el("div");
  holder.id = "registry-holder";
  holder.append(note(D.loading));
  card.append(holder);
  return card;
}

async function loadRegistry(cursor: string | null, replace: boolean): Promise<void> {
  const holder = document.getElementById("registry-holder");
  if (!holder) return;
  if (replace) holder.replaceChildren(note(D.loading));

  const result = await sendToBackground<ListResult>({ kind: "LINK_LIST", cursor });
  if (!result.ok) {
    holder.replaceChildren(note(result.code === "upgrade_required" ? D.upgradeNeeded : D.couldNotLoad));
    return;
  }
  if (replace) holder.replaceChildren();
  // Drop any prior "load more" button before appending the next page.
  holder.querySelector(".load-more")?.remove();

  if (result.links.length === 0 && replace) {
    holder.append(note(D.noLinks));
    return;
  }

  let list = holder.querySelector<HTMLElement>(".reg-list");
  if (!list) {
    list = el("ul", "reg-list");
    holder.append(list);
  }
  for (const link of result.links) {
    const li = el("li", "reg-item");

    const main = el("div", "reg-main");
    const a = el("a", "reg-short") as HTMLAnchorElement;
    a.href = link.shortUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = link.shortUrl.replace(/^https?:\/\//, "");
    main.append(a);
    if (link.label) {
      const label = el("span", "reg-label");
      label.textContent = link.label;
      main.append(label);
    }
    li.append(main);

    const target = el("div", "reg-target");
    target.textContent = link.targetUrl ?? "";
    li.append(target);

    if (link.repointedAt) {
      const badge = el("span", "reg-repointed");
      badge.textContent = D.repointedNote(new Date(link.repointedAt).toLocaleDateString());
      li.append(badge);
    }

    const actions = el("div", "reg-actions");
    const repointBtn = el("button", "ghost small");
    repointBtn.textContent = D.repoint;
    const status = el("span", "muted small");
    repointBtn.onclick = () => void doRepoint(link.slug, link.asin, link.marketplace, status);
    actions.append(repointBtn, status);
    li.append(actions);

    list.append(li);
  }

  if (result.nextCursor) {
    const more = el("button", "ghost load-more");
    more.textContent = D.loadMore;
    more.onclick = () => {
      more.remove();
      void loadRegistry(result.nextCursor, false);
    };
    holder.append(more);
  }
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

function linkCell(href: string, text: string): HTMLElement {
  const td = el("td", "link");
  const a = el("a") as HTMLAnchorElement;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  td.append(a);
  return td;
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
