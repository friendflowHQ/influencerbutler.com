import { addSection, chip, el } from "../../ui/components";
import { resolveLocale } from "../../i18n";
import { getSettings } from "../../storage/store";
import { getRateCard } from "../../rate-card/cache";
import { resolveRatePct } from "../score/rate";
import { formatCents } from "../calculator/model";
import { CREATOR_API_MARKETPLACES } from "../../shared/constants";
import {
  sendToBackground,
  type EnrichResult,
  type GenerateLinkResult,
} from "../../shared/messages";
import { getCachedEnrich, setCachedEnrich } from "../inline-card/enrich-cache";
import type { ProductSignals } from "../../amazon/product-signals";
import {
  estimateCommissionCents,
  marketAvailability,
  summarizeReach,
  type MarketAvailability,
} from "./model";

// Global Marketplace Maximizer: for the product on screen, one row per Creator
// API marketplace showing availability, local price, and an estimated
// commission per sale, plus a one-tap localized affiliate link per market and a
// "copy all" for the whole international set. The point is money a creator
// otherwise leaves on the table: an int'l viewer who clicks a US link and
// cannot buy earns nothing, but a localized link converts on their own store.
//
// Availability + price come from the same Creator API enrich path the inline
// card uses (shared cache). Link generation needs neither enrich nor Creator
// API keys, so the market list and the links still work when enrich is off; the
// price/availability columns simply stay blank and a connect affordance shows.

const MARKET_CODE: Record<string, string> = {
  "amazon.com": "US",
  "amazon.ca": "CA",
  "amazon.co.uk": "UK",
  "amazon.com.au": "AU",
  "amazon.de": "DE",
  "amazon.fr": "FR",
  "amazon.it": "IT",
  "amazon.es": "ES",
  "amazon.co.jp": "JP",
  "amazon.in": "IN",
  "amazon.com.mx": "MX",
  "amazon.com.br": "BR",
};

type Strings = {
  heading: string;
  info: string;
  summaryLoading: string;
  summary: (abroad: number, total: number) => string;
  summaryNone: string;
  connectApi: string;
  getLink: string;
  copyAll: string;
  working: string;
  copied: string;
  linkFailed: string;
  noLinks: string;
  commissionEst: (amount: string) => string;
  inStock: string;
  unavailable: string;
  notListed: string;
  note: string;
};

const EN: Strings = {
  heading: "Global reach",
  info: "See where this product sells and grab a localized affiliate link for each marketplace, so international viewers earn you a commission instead of hitting a dead link.",
  summaryLoading: "Checking marketplaces...",
  summary: (abroad, total) => `Available in ${total} markets (${abroad} beyond your home store).`,
  summaryNone: "Not found in other marketplaces yet.",
  connectApi: "Connect the Amazon Creator API in Settings to see price and availability per market.",
  getLink: "Get link",
  copyAll: "Copy all international links",
  working: "Working...",
  copied: "Copied",
  linkFailed: "Could not build a link",
  noLinks: "No other markets to link yet.",
  commissionEst: (amount) => `~${amount}/sale`,
  inStock: "In stock",
  unavailable: "Unavailable",
  notListed: "Not listed",
  note: "Commission is estimated from your configured rate; actual Associates rates vary by marketplace and category. Add your own #ad disclosure when you share a link.",
};

const CATALOG: Record<string, Strings> = {
  en: EN,
  es: {
    heading: "Alcance global",
    info: "Mira dónde se vende este producto y consigue un enlace de afiliado localizado para cada tienda, para que el público internacional te genere comisión en vez de encontrar un enlace muerto.",
    summaryLoading: "Revisando tiendas...",
    summary: (abroad, total) => `Disponible en ${total} tiendas (${abroad} fuera de tu tienda local).`,
    summaryNone: "Aún no se encontró en otras tiendas.",
    connectApi: "Conecta la API de Creadores de Amazon en Ajustes para ver precio y disponibilidad por tienda.",
    getLink: "Obtener enlace",
    copyAll: "Copiar todos los enlaces internacionales",
    working: "Procesando...",
    copied: "Copiado",
    linkFailed: "No se pudo crear el enlace",
    noLinks: "Aún no hay otras tiendas para enlazar.",
    commissionEst: (amount) => `~${amount}/venta`,
    inStock: "En stock",
    unavailable: "No disponible",
    notListed: "No listado",
    note: "La comisión se estima con tu tasa configurada; las tasas reales de Associates varían por tienda y categoría. Añade tu propia divulgación (#ad) al compartir un enlace.",
  },
  fr: {
    heading: "Portée mondiale",
    info: "Voyez où ce produit se vend et récupérez un lien d'affiliation localisé pour chaque boutique, pour que votre audience internationale vous rapporte une commission au lieu d'un lien mort.",
    summaryLoading: "Vérification des boutiques...",
    summary: (abroad, total) => `Disponible dans ${total} boutiques (${abroad} hors de votre boutique locale).`,
    summaryNone: "Pas encore trouvé dans d'autres boutiques.",
    connectApi: "Connectez l'API Créateurs d'Amazon dans les Réglages pour voir le prix et la disponibilité par boutique.",
    getLink: "Obtenir le lien",
    copyAll: "Copier tous les liens internationaux",
    working: "Traitement...",
    copied: "Copié",
    linkFailed: "Impossible de créer le lien",
    noLinks: "Aucune autre boutique à lier pour l'instant.",
    commissionEst: (amount) => `~${amount}/vente`,
    inStock: "En stock",
    unavailable: "Indisponible",
    notListed: "Non listé",
    note: "La commission est estimée d'après votre taux configuré ; les taux réels d'Associates varient selon la boutique et la catégorie. Ajoutez votre propre mention (#ad) en partageant un lien.",
  },
};

type MarketRow = {
  host: string;
  code: string;
  isHome: boolean;
  availability: MarketAvailability | "unknown";
  priceCents: number | null;
  currency: string | null;
  availEl: HTMLElement;
  priceEl: HTMLElement;
};

export async function renderGlobalMaximizer(signals: ProductSignals): Promise<void> {
  const asin = signals.asin;
  if (!asin) return;
  const settings = await getSettings();
  const s = CATALOG[resolveLocale(settings.locale)] ?? EN;

  const section = addSection(s.heading, s.info);

  const summary = el("p", "note", s.summaryLoading);
  section.append(summary);

  const homeCode = codeFor(signals.marketplace);
  const card = await getRateCard();
  const ratePct = resolveRatePct({
    liveRatePct: signals.commissionRatePct,
    category: signals.category,
    card,
    defaultRatePct: settings.commissionRatePct,
  });

  // One row per Creator API marketplace, home store first. Availability/price
  // fill in from enrich; the link button works immediately without it.
  const list = el("div", "gmm-list");
  const rows: MarketRow[] = [];
  const ordered = [...CREATOR_API_MARKETPLACES].sort((a, b) => {
    const ah = codeFor(a.host) === homeCode ? 0 : 1;
    const bh = codeFor(b.host) === homeCode ? 0 : 1;
    return ah - bh;
  });
  for (const market of ordered) {
    const code = codeFor(market.host);
    const availEl = chip("warn", code);
    const priceEl = el("span", "gmm-price");
    const row: MarketRow = {
      host: market.host,
      code,
      isHome: code === homeCode,
      availability: "unknown",
      priceCents: null,
      currency: null,
      availEl,
      priceEl,
    };
    rows.push(row);

    const line = el("div", "gmm-row");
    const left = el("div", "gmm-row-main");
    left.append(availEl, priceEl);
    if (row.isHome) left.append(chip("", homeCode === code ? "home" : code));
    const linkBtn = el("button", "btn secondary") as HTMLButtonElement;
    linkBtn.type = "button";
    linkBtn.textContent = s.getLink;
    linkBtn.addEventListener("click", () => {
      void copyOneLink(linkBtn, asin, market.host, s);
    });
    line.append(left, linkBtn);
    list.append(line);
  }
  // Seed the home market's availability from the page so the row is never blank.
  const home = rows.find((r) => r.isHome);
  if (home) {
    home.availability = signals.inStock ? "available" : "unavailable";
    home.priceCents = signals.priceCents;
    home.currency = signals.currency;
    paintRow(home, s);
  }
  section.append(list);

  // Copy every localized link for the markets other than home in one go.
  const copyAll = el("button", "btn") as HTMLButtonElement;
  copyAll.type = "button";
  copyAll.textContent = s.copyAll;
  copyAll.addEventListener("click", () => {
    void copyAllLinks(copyAll, asin, rows, s);
  });
  section.append(copyAll);

  const note = el("p", "affiliate-note", s.note);
  section.append(note);

  void enrich(asin, rows, ratePct, summary, section, homeCode, s);
}

async function enrich(
  asin: string,
  rows: MarketRow[],
  ratePct: number,
  summary: HTMLElement,
  section: HTMLElement,
  homeCode: string,
  s: Strings,
): Promise<void> {
  let result = await getCachedEnrich(asin);
  if (!result) {
    result = await sendToBackground<EnrichResult>({
      kind: "ENRICH_PRODUCTS",
      asins: [asin],
    }).catch(() => null);
    if (result) await setCachedEnrich(asin, result);
  }
  if (!result) {
    summary.textContent = s.summaryNone;
    return;
  }
  if (!result.configured) {
    summary.textContent = s.summaryNone;
    const connect = el("a", "inline-connect", s.connectApi);
    connect.addEventListener("click", (event) => {
      event.preventDefault();
      void sendToBackground({ kind: "OPEN_OPTIONS" });
    });
    section.insertBefore(connect, summary.nextSibling);
    return;
  }

  const enrichRows = result.items.find((i) => i.asin === asin)?.results ?? [];
  for (const er of enrichRows) {
    const code = codeFor(er.marketplace);
    const row = rows.find((r) => r.code === code);
    if (!row) continue;
    row.availability = marketAvailability(er);
    row.priceCents = er.priceCents;
    row.currency = er.currency;
    paintRow(row, s, ratePct, er.priceDisplay);
  }

  const reach = summarizeReach(
    rows.map((r) => ({
      code: r.code,
      availability: r.availability === "unknown" ? "notlisted" : r.availability,
    })),
    homeCode,
  );
  summary.textContent =
    reach.availableTotal > 0 ? s.summary(reach.availableAbroad, reach.availableTotal) : s.summaryNone;
}

function paintRow(row: MarketRow, s: Strings, ratePct?: number, priceDisplay?: string | null): void {
  const status = row.availability;
  const cls =
    status === "available" ? "good" : status === "unavailable" ? "bad" : status === "unknown" ? "warn" : "warn";
  row.availEl.className = `chip ${cls}`;
  row.availEl.textContent = `${row.code} ${availWord(status, s)}`.trim();

  const parts: string[] = [];
  if (priceDisplay) {
    parts.push(priceDisplay);
  } else if (row.priceCents !== null) {
    parts.push(formatCents(row.priceCents, row.currency ?? "USD"));
  }
  const comm = estimateCommissionCents(row.priceCents, ratePct ?? null);
  if (comm !== null) parts.push(s.commissionEst(formatCents(comm, row.currency ?? "USD")));
  row.priceEl.textContent = parts.join(" · ");
}

function availWord(status: MarketAvailability | "unknown", s: Strings): string {
  switch (status) {
    case "available":
      return s.inStock;
    case "unavailable":
      return s.unavailable;
    case "notlisted":
      return s.notListed;
    case "unknown":
      return "";
  }
}

async function copyOneLink(
  btn: HTMLButtonElement,
  asin: string,
  host: string,
  s: Strings,
): Promise<void> {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = s.working;
  const result = await sendToBackground<GenerateLinkResult>({
    kind: "GENERATE_AFFILIATE_LINK",
    asin,
    marketplace: host,
    url: `https://www.${host}/dp/${asin}`,
  }).catch(() => null);
  if (result?.ok && result.url) {
    try {
      await navigator.clipboard.writeText(result.url);
      btn.textContent = s.copied;
    } catch {
      btn.textContent = result.url;
    }
  } else {
    btn.textContent = s.linkFailed;
  }
  window.setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1500);
}

async function copyAllLinks(
  btn: HTMLButtonElement,
  asin: string,
  rows: MarketRow[],
  s: Strings,
): Promise<void> {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = s.working;
  // Prefer markets we have confirmed carry the product; before enrich lands,
  // fall back to every non-home market so the button is never dead.
  const confirmed = rows.filter((r) => !r.isHome && r.availability === "available");
  const targets = confirmed.length > 0 ? confirmed : rows.filter((r) => !r.isHome);
  if (targets.length === 0) {
    btn.textContent = s.noLinks;
    window.setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1500);
    return;
  }
  const results = await Promise.all(
    targets.map((row) =>
      sendToBackground<GenerateLinkResult>({
        kind: "GENERATE_AFFILIATE_LINK",
        asin,
        marketplace: row.host,
        url: `https://www.${row.host}/dp/${asin}`,
      })
        .then((r) => ({ code: row.code, url: r.ok ? r.url ?? null : null }))
        .catch(() => ({ code: row.code, url: null })),
    ),
  );
  const lines = results.filter((r) => r.url).map((r) => `${r.code}: ${r.url}`);
  if (lines.length === 0) {
    btn.textContent = s.linkFailed;
  } else {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      btn.textContent = s.copied;
    } catch {
      btn.textContent = s.linkFailed;
    }
  }
  window.setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1800);
}

function codeFor(marketplace: string): string {
  return MARKET_CODE[marketplace] ?? marketplace.replace(/^amazon\./, "").toUpperCase();
}
