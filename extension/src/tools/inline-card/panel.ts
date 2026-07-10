import { chip, copyButton, el } from "../../ui/components";
import { createInlineShadow } from "../../ui/host";
import { query } from "../../amazon/selectors";
import { t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import type { EnrichedProduct, EnrichResult, HudCommandResult } from "../../shared/messages";
import type { ProductRef } from "../../transport/hud-commands";
import type { ProductSignals } from "../../amazon/product-signals";
import { getCachedEnrich, setCachedEnrich } from "./enrich-cache";

// An inline card mounted next to the buybox (not the floating panel): the
// product's identity, its market availability from the Creator API, and a
// one-tap Collab Butler action. In our colors, deliberately distinct from the
// competitor. Degrades gracefully: a US pill always shows from the page, and
// the cross-country pills fill in only when the user has Creator API keys.

const HOST_ID = "ib-ext-inline-card";

// Marketplace host -> short code for the availability pills.
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

type Availability = "available" | "unavailable" | "notlisted";

export function renderInlineCard(signals: ProductSignals): void {
  document.getElementById(HOST_ID)?.remove();
  if (!signals.asin) return;
  const anchor = query(document, "buyboxAnchor");
  if (!anchor) return;

  const { host, root } = createInlineShadow();
  host.id = HOST_ID;

  const card = el("div", "inline-card");
  card.append(el("p", "inline-card-title", t().inlineCardTitle));

  const ids = el("div", "idrows");
  ids.append(idRow(t().snapshotProduct, signals.asin));
  if (signals.parentAsin && signals.parentAsin !== signals.asin) {
    ids.append(idRow(t().snapshotParent, signals.parentAsin));
  }
  card.append(ids);

  if (signals.category) {
    const meta = el("div", "counts");
    meta.append(chip("", t().snapshotCategory(signals.category)));
    card.append(meta);
  }

  // Availability: a pill for the current market straight from the page, then
  // enriched to more markets by the Creator API.
  card.append(el("p", "inline-avail-label", t().inlineAvailabilityHeading));
  const pills = el("div", "counts");
  const currentCode = codeFor(signals.marketplace);
  pills.append(availPill(currentCode, signals.inStock ? "available" : "unavailable"));
  card.append(pills);

  // Collab Butler action (over the app bridge).
  const collabBtn = el("button", "btn secondary") as HTMLButtonElement;
  collabBtn.textContent = t().addToCollab;
  const status = el("p", "progress");
  collabBtn.addEventListener("click", () => {
    collabBtn.disabled = true;
    status.textContent = t().addingCollab;
    void sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "collaboration.add", product: toProductRef(signals) },
    })
      .then((r) => {
        status.textContent = r.ok ? (r.message ?? t().sentToApp) : (r.message ?? t().couldNotReachApp);
      })
      .catch(() => (status.textContent = t().couldNotReachApp))
      .finally(() => (collabBtn.disabled = false));
  });
  const actionRow = el("div", "row");
  actionRow.append(collabBtn);
  card.append(actionRow, status);

  root.append(card);
  mount(anchor, host);

  void enrich(signals.asin, pills, card, currentCode);
}

async function enrich(
  asin: string,
  pills: HTMLElement,
  card: HTMLElement,
  currentCode: string,
): Promise<void> {
  let result = await getCachedEnrich(asin);
  if (!result) {
    result = await sendToBackground<EnrichResult>({ kind: "ENRICH_PRODUCTS", asins: [asin] }).catch(
      () => null,
    );
    if (result) await setCachedEnrich(asin, result);
  }
  if (!result) return;

  if (!result.configured) {
    const connect = el("a", "inline-connect", t().inlineConnectCreatorApi);
    connect.addEventListener("click", (event) => {
      event.preventDefault();
      void sendToBackground({ kind: "OPEN_OPTIONS" });
    });
    card.append(connect);
    return;
  }

  const rows = result.items.find((i) => i.asin === asin)?.results ?? [];
  if (rows.length === 0) return;

  // Rebuild the pills from the authoritative per-market data.
  pills.replaceChildren();
  for (const row of rows) {
    pills.append(availPill(codeFor(row.marketplace), availabilityOf(row)));
  }

  // Authoritative price / Prime for the page's marketplace.
  const cur = rows.find((r) => codeFor(r.marketplace) === currentCode) ?? rows[0];
  if (cur && cur.found && cur.priceDisplay) {
    const price = el("p", "note");
    price.textContent = cur.primeEligible ? `${cur.priceDisplay} · Prime` : cur.priceDisplay;
    card.append(price);
  }
}

function availabilityOf(row: EnrichedProduct): Availability {
  if (!row.found) return "notlisted";
  const message = (row.availability ?? "").toLowerCase();
  if (/unavailable|out of stock|no longer|not available/.test(message)) return "unavailable";
  return "available";
}

function idRow(label: string, value: string): HTMLElement {
  const row = el("div", "idrow");
  row.append(el("span", "idrow-label", label));
  row.append(el("span", "idrow-value", value));
  row.append(copyButton(value));
  return row;
}

function availPill(code: string, status: Availability): HTMLElement {
  const cls = status === "available" ? "good" : status === "unavailable" ? "bad" : "warn";
  return chip(cls, `${code} ${availWord(status)}`);
}

function availWord(status: Availability): string {
  return status === "available"
    ? t().inlineInStock
    : status === "unavailable"
      ? t().inlineUnavailable
      : t().inlineNotListed;
}

function codeFor(marketplace: string): string {
  return MARKET_CODE[marketplace] ?? marketplace.replace(/^amazon\./, "").toUpperCase();
}

function mount(anchor: Element, host: HTMLElement): void {
  // Sit just above the buybox when we found it; otherwise at the top of the
  // right column so the card leads the buying area.
  if (anchor.id === "desktop_buybox" || anchor.id === "buybox") {
    anchor.insertAdjacentElement("beforebegin", host);
  } else {
    anchor.insertAdjacentElement("afterbegin", host);
  }
}

function toProductRef(signals: ProductSignals): ProductRef {
  return {
    asin: signals.asin as string,
    marketplace: signals.marketplace,
    title: signals.title?.slice(0, 200),
    priceCents: signals.priceCents,
    currency: signals.currency,
    imageUrl: signals.imageUrl ?? undefined,
    commissionRatePct: signals.commissionRatePct,
  };
}
