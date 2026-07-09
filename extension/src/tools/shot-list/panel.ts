import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import type { ProductSignals } from "../../amazon/product-signals";

// A product-specific filming plan on the product page. Butler Approved tells the
// creator a product is worth filming; this tells them how to film it: the exact
// features to show on camera (scraped from the listing, already in the page's
// language) plus a short set of best-practice beats including the FTC
// disclosure. Pure client-side, no bridge, no network. "Copy" drops the whole
// plan onto the clipboard to paste into a notes app before shooting.

// How many of the listing's own feature bullets to surface as "show this".
const MAX_FEATURES = 4;

export function renderShotList(signals: ProductSignals): void {
  if (!signals.asin) return;
  const features = scrapeFeatures();
  const section = addSection(t().shotListTitle);

  if (features.length > 0) {
    section.append(el("p", "note", t().shotListShowFeatures));
    const featureList = el("ul", "list");
    for (const f of features) featureList.append(el("li", "", f));
    section.append(featureList);
  }

  const beats = buildBeats();
  const beatList = el("ul", "list");
  for (const b of beats) beatList.append(el("li", "", b));
  section.append(beatList);

  const copyBtn = el("button", "btn secondary") as HTMLButtonElement;
  copyBtn.type = "button";
  copyBtn.textContent = t().copy;
  copyBtn.addEventListener("click", () => {
    const text = buildPlainText(features, beats);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        copyBtn.textContent = t().copied;
        window.setTimeout(() => (copyBtn.textContent = t().copy), 1200);
      })
      .catch(() => undefined);
  });
  section.append(copyBtn);
}

// The fixed best-practice beats, ending on the FTC disclosure so it is never an
// afterthought.
function buildBeats(): string[] {
  return [
    t().shotListBeatHook,
    t().shotListBeatUnbox,
    t().shotListBeatUse,
    t().shotListBeatResult,
    t().shotListBeatCta,
    t().shotListBeatFtc,
  ];
}

function buildPlainText(features: string[], beats: string[]): string {
  const lines = [t().shotListTitle];
  if (features.length > 0) {
    lines.push("", t().shotListShowFeatures);
    for (const f of features) lines.push(`- ${f}`);
  }
  lines.push("");
  for (const b of beats) lines.push(`- ${b}`);
  return lines.join("\n");
}

// Read the listing's feature bullets from the DOM. Amazon uses #feature-bullets
// on most listings and #productFactsDesktopExpander on the newer layout; take
// whichever has content. Skip the boilerplate "Make sure this fits" line and
// anything too short to be a real feature.
function scrapeFeatures(): string[] {
  const nodes = [
    ...document.querySelectorAll<HTMLElement>("#feature-bullets li:not(.aok-hidden) .a-list-item"),
    ...document.querySelectorAll<HTMLElement>("#productFactsDesktopExpander li .a-list-item"),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 12 || text.length > 180) continue;
    if (/make sure this fits/i.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_FEATURES) break;
  }
  return out;
}
