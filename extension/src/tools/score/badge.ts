import { addSection, el, infoTip } from "../../ui/components";
import { getLocale, t } from "../../i18n";
import { sendToBackground } from "../../shared/messages";
import { guideUrlFor } from "../../shared/constants";
import type { ButlerScore } from "./model";

// The Butler Score panel section: the 0-100 number, a hot/warm/cool band, and
// a hover breakdown of where the points came from. Sits next to the Butler
// Approved seal on product pages (it complements, not replaces, the seal).
export function renderScore(score: ButlerScore): void {
  const section = addSection(t().butlerScore, t().butlerScoreIntro);

  const badge = el("div", `score-badge ${score.band}`);
  const num = el("span", "score-num", String(score.score));
  const meta = el("span", "score-meta");
  meta.append(
    el("span", "score-band", t().scoreBandLabel(score.band)),
    el("span", "score-outof", t().scoreOutOf),
  );
  badge.append(num, meta, infoTip(breakdown(score)));
  section.append(badge);
  section.append(guideLink());
}

// "How the score works" PDF link under the number. The panel lives in a shadow
// DOM, where a plain anchor does not reliably navigate, so a normal click is
// routed through the background worker (same pattern as the app upsell CTA).
function guideLink(): HTMLElement {
  const url = guideUrlFor(getLocale());
  const link = el("a", "inline-connect", t().scoreGuideLink) as HTMLAnchorElement;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    void sendToBackground<void>({ kind: "OPEN_URL", url });
  });
  return link;
}

// Compact "why this number" line for the tooltip: the weighted points each
// component contributed, largest first.
function breakdown(score: ButlerScore): string {
  const rows: Array<[string, number]> = [
    [t().scorePartCommission, score.parts.commission],
    [t().scorePartSlot, score.parts.slot],
    [t().scorePartDemand, score.parts.demand],
    [t().scorePartAvailability, score.parts.availability],
    [t().scorePartPrice, score.parts.price],
    [t().scorePartCampaign, score.parts.campaign],
  ];
  return rows
    .sort((a, b) => b[1] - a[1])
    .map(([label, points]) => `${label}: +${Math.round(points)}`)
    .join(" · ");
}
