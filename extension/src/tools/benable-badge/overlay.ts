import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { formatMoney } from "../earnings-overlay/model";
import {
  sendToBackground,
  type CcRate,
  type CcRatesResult,
  type SpccRate,
  type SpccRatesResult,
} from "../../shared/messages";
import { benableIndex } from "./feed";
import { matchRec } from "./model";
import { renderBenableDetail } from "./detail";

// A compact Amazon money-signal chip on each Benable list card whose outbound
// link is an Amazon product: the Creator Connections commission rate (or SPCC
// forecast) when there is a campaign, else a neutral "Amazon" chip. Clicking it
// expands the richer signals (personal enrollment, earnings/conversion,
// ownership, catalogue price/demand) for that ASIN. ASINs come from the
// MAIN-world hook's feed, joined to cards by rec_object photo id (see model.ts),
// so this is a no-op until that feed arrives.

const DONE_ATTR = "data-ib-benable";
const HOST_CLASS = "benable-badge-host";
const PHOTO_ID_RE = /\/rec_object_photos\/(\d+)\//;

type CardEntry = { card: HTMLElement; asin: string };

export async function initBenableBadges(): Promise<void> {
  // Tear down prior badges + markers so a Svelte re-render (or a scroll that
  // added cards) re-decorates the current list cleanly instead of stacking.
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  for (const marked of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
  }

  const index = benableIndex();
  if (index.recs.length === 0) return;

  const entries: CardEntry[] = [];
  for (const card of findCards()) {
    const rec = matchRec(index, { photoId: card.photoId, text: card.text });
    if (!rec) continue;
    card.card.setAttribute(DONE_ATTR, "1");
    entries.push({ card: card.card, asin: rec.asin });
  }
  if (entries.length === 0) return;

  const asins = [...new Set(entries.map((e) => e.asin))];
  const [cc, spcc] = await Promise.all([
    sendToBackground<CcRatesResult>({ kind: "LOOKUP_CC_RATES", asins }).catch(
      () => ({ ok: false, rates: {} }) as CcRatesResult,
    ),
    sendToBackground<SpccRatesResult>({ kind: "LOOKUP_SPCC_RATES", asins }).catch(
      () => ({ ok: false, rates: {} }) as SpccRatesResult,
    ),
  ]);

  for (const entry of entries) {
    // The card may have been removed by a re-render while we awaited the lookup.
    if (!entry.card.isConnected) continue;
    mountBadge(entry.card, entry.asin, cc.rates[entry.asin] ?? null, spcc.rates[entry.asin] ?? null);
  }
}

// Every rendered card: anchored on the note element Benable stamps with
// data-rec-id, climbed up to the wrapper that also holds the product image, so
// the badge sits on the whole card and the photo id (the join key) is in reach.
function findCards(): Array<{ card: HTMLElement; photoId: string | null; text: string }> {
  const out: Array<{ card: HTMLElement; photoId: string | null; text: string }> = [];
  const seen = new Set<Element>();
  for (const note of Array.from(document.querySelectorAll("[data-rec-id]"))) {
    const card = cardContainer(note);
    if (!card || seen.has(card) || card.getAttribute(DONE_ATTR)) continue;
    seen.add(card);
    const img = card.querySelector<HTMLImageElement>('img[src*="/rec_object_photos/"]');
    const photoId = img ? (img.src.match(PHOTO_ID_RE)?.[1] ?? null) : null;
    out.push({ card, photoId, text: card.textContent ?? "" });
  }
  return out;
}

// The smallest ancestor of a data-rec-id note whose subtree also contains the
// product image, i.e. the item card. Bounded climb so a note without an image
// (the list's welcome note) simply yields null.
function cardContainer(note: Element): HTMLElement | null {
  let el: HTMLElement | null = note as HTMLElement;
  for (let i = 0; i < 12 && el; i++) {
    if (el.querySelector?.('img[src*="/rec_object_photos/"]')) return el;
    el = el.parentElement;
  }
  return null;
}

function mountBadge(
  card: HTMLElement,
  asin: string,
  cc: CcRate | null,
  spcc: SpccRate | null,
): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const wrap = el("div", "benable-badge");

  const chip = el("button", "tile-chip benable-chip") as HTMLButtonElement;
  chip.type = "button";
  if (cc) {
    chip.classList.add("good");
    chip.textContent = t().benableChipCc(cc.ratePct);
  } else if (spcc) {
    chip.classList.add("good");
    chip.textContent = t().benableChipSpcc(formatMoney(spcc.epc, "USD"));
  } else {
    chip.textContent = t().benableChipNone;
  }
  chip.title = t().benableChipTitle;

  const detail = el("div", "benable-detail");
  detail.hidden = true;
  let built = false;
  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    detail.hidden = !detail.hidden;
    chip.classList.toggle("open", !detail.hidden);
    if (!detail.hidden && !built) {
      built = true;
      void renderBenableDetail(detail, asin, cc, spcc);
    }
  });

  wrap.append(chip, detail);
  root.append(wrap);

  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  host.style.position = "absolute";
  host.style.top = "6px";
  host.style.right = "6px";
  host.style.zIndex = "5";
  host.style.width = "auto";
  card.append(host);
}
