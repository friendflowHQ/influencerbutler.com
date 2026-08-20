import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import type { CampaignScore, CampaignScoreBand } from "./score";
import type {
  CampaignBriefDemand,
  CampaignBriefResult,
  CampaignBriefSections,
} from "../../shared/messages";

// Campaign Butler's "Butler's Brief": a floating, on-demand panel that expands
// from a campaign card's score badge. The headline number (score) and the
// confidence are computed locally and passed in, so they render instantly and
// truthfully; the reasoning prose arrives from the server a beat later. On an
// LLM miss the panel degrades to the local score breakdown. This is our own take
// on a competitor's per-campaign AI verdict, in the butler's voice.

export type CampaignBriefOpen = {
  brand: string | null;
  score: CampaignScore;
  confidence: number;
  // 2-letter locale for currency/number formatting of the demand figures.
  locale: string;
  // Fires the GET_CAMPAIGN_BRIEF round trip (built by the overlay, which holds
  // the campaign signals + license-safe background channel).
  request: () => Promise<CampaignBriefResult>;
  // Clicks the campaign's native Accept button, or null when the card had none
  // (already accepted / declined, or the button was not found).
  onAccept: (() => void) | null;
  watched: boolean;
  // Toggles the Last Call watch and resolves to the authoritative new state, or
  // null when the campaign exposes no stable id to watch.
  onToggleWatch: (() => Promise<boolean>) | null;
};

// Only one brief is open at a time. Track the host so a second open (or a page
// teardown) closes the previous cleanly.
let openHost: HTMLElement | null = null;

const BAND_COLOR: Record<CampaignScoreBand, string> = {
  hot: "#16a34a",
  warm: "#f59e0b",
  cool: "#6b7280",
};

export function closeCampaignBrief(): void {
  openHost?.remove();
  openHost = null;
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

function verdictFallback(band: CampaignScoreBand): string {
  return band === "hot"
    ? t().campaignBriefVerdictHot
    : band === "warm"
      ? t().campaignBriefVerdictWarm
      : t().campaignBriefVerdictCool;
}

function sectionTitle(text: string): HTMLElement {
  const h = el("div", "", text);
  h.style.fontWeight = "700";
  h.style.fontSize = "13px";
  h.style.margin = "14px 0 6px";
  h.style.color = "#111827";
  return h;
}

function bulletList(items: string[]): HTMLElement {
  const ul = el("ul");
  ul.style.margin = "0";
  ul.style.padding = "0 0 0 18px";
  ul.style.fontSize = "13px";
  ul.style.lineHeight = "1.45";
  ul.style.color = "#374151";
  for (const item of items) {
    const li = el("li", "", item);
    li.style.marginBottom = "3px";
    ul.append(li);
  }
  return ul;
}

function paragraph(text: string): HTMLElement {
  const p = el("div", "", text);
  p.style.fontSize = "13px";
  p.style.lineHeight = "1.45";
  p.style.color = "#374151";
  return p;
}

// Build the copyable plain-text form of the brief, so "Copy brief" hands the
// creator something they can paste into their notes or a content plan.
function briefToText(
  brand: string | null,
  score: CampaignScore,
  confidence: number,
  sections: CampaignBriefSections | null,
  demand: CampaignBriefDemand | null,
  locale: string,
): string {
  const lines: string[] = [];
  lines.push(`${t().campaignBriefTitle}${brand ? `: ${brand}` : ""}`);
  const verdict = sections?.verdictWord || verdictFallback(score.band);
  lines.push(`${verdict} - ${score.score}/100, ${t().campaignBriefConfidence(confidence)}`);
  if (sections) {
    if (sections.whyTake.length) lines.push("", t().campaignBriefWhy, ...sections.whyTake.map((s) => `- ${s}`));
    if (sections.whatToFilm.length) lines.push("", t().campaignBriefFilm, ...sections.whatToFilm.map((s) => `- ${s}`));
    if (demand) {
      const est = money(demand.estMonthlyRevenueCents, locale);
      lines.push("", t().campaignBriefPick, `${demand.asin}${est ? ` - ${est}/month est.` : ""}`);
      if (sections.pickReason) lines.push(sections.pickReason);
    }
    if (sections.onAmazon) lines.push("", t().campaignBriefOnAmazon, sections.onAmazon);
    if (sections.offAmazon.length) lines.push("", t().campaignBriefOffAmazon, ...sections.offAmazon.map((s) => `- ${s}`));
    if (sections.audiences.length) lines.push("", `${t().campaignBriefAudience}: ${sections.audiences.join(", ")}`);
  }
  return lines.join("\n");
}

// The local score breakdown, shown when the model could not write prose (or
// while degraded), so the panel is never empty: the same weighted parts the
// score is built from, largest contribution first.
function scoreBreakdown(score: CampaignScore): HTMLElement {
  const labels: Record<keyof CampaignScore["parts"], string> = {
    commission: "Commission",
    owned: "You own it",
    urgency: "Urgency",
    timing: "Runway",
    budget: "Budget",
    earner: "Proven earner",
  };
  const wrap = el("div");
  wrap.style.display = "flex";
  wrap.style.flexWrap = "wrap";
  wrap.style.gap = "6px";
  const entries = (Object.keys(score.parts) as Array<keyof CampaignScore["parts"]>)
    .map((k) => [k, score.parts[k]] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [k, v] of entries) {
    const chip = el("span", "", `${labels[k]} +${Math.round(v)}`);
    chip.style.fontSize = "12px";
    chip.style.fontWeight = "600";
    chip.style.padding = "3px 8px";
    chip.style.borderRadius = "999px";
    chip.style.background = "rgba(0,0,0,0.06)";
    chip.style.color = "#374151";
    wrap.append(chip);
  }
  return wrap;
}

function actionButton(label: string, primary: boolean): HTMLButtonElement {
  const btn = el("button", "", label) as HTMLButtonElement;
  btn.type = "button";
  btn.style.border = primary ? "none" : "1px solid #d1d5db";
  btn.style.background = primary ? "#2563eb" : "#fff";
  btn.style.color = primary ? "#fff" : "#374151";
  btn.style.fontWeight = "600";
  btn.style.fontSize = "13px";
  btn.style.padding = "8px 14px";
  btn.style.borderRadius = "8px";
  btn.style.cursor = "pointer";
  return btn;
}

export function openCampaignBrief(opts: CampaignBriefOpen): void {
  closeCampaignBrief();

  const { host, root } = createInlineShadow("radar-brief-host");
  openHost = host;

  const backdrop = el("div");
  backdrop.style.position = "fixed";
  backdrop.style.inset = "0";
  backdrop.style.background = "rgba(0,0,0,0.4)";
  backdrop.style.zIndex = "2147483646";
  backdrop.style.display = "flex";
  backdrop.style.alignItems = "flex-start";
  backdrop.style.justifyContent = "center";
  backdrop.style.padding = "40px 16px";
  backdrop.style.overflowY = "auto";

  const card = el("div");
  card.style.background = "#fff";
  card.style.color = "#111827";
  card.style.width = "min(520px, 100%)";
  card.style.borderRadius = "14px";
  card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.3)";
  card.style.padding = "18px 20px 16px";
  card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  // Stop clicks inside the card from closing the panel.
  card.addEventListener("click", (e) => e.stopPropagation());

  // ---- Header ----
  const header = el("div");
  header.style.display = "flex";
  header.style.alignItems = "baseline";
  header.style.justifyContent = "space-between";
  header.style.gap = "10px";
  const titleWrap = el("div");
  const title = el("div", "", t().campaignBriefTitle);
  title.style.fontWeight = "800";
  title.style.fontSize = "15px";
  titleWrap.append(title);
  if (opts.brand) {
    const brand = el("div", "", opts.brand);
    brand.style.fontSize = "13px";
    brand.style.color = "#6b7280";
    titleWrap.append(brand);
  }
  const close = el("button", "", "✕") as HTMLButtonElement;
  close.type = "button";
  close.setAttribute("aria-label", t().campaignBriefClose);
  close.style.border = "none";
  close.style.background = "transparent";
  close.style.fontSize = "16px";
  close.style.cursor = "pointer";
  close.style.color = "#6b7280";
  close.addEventListener("click", closeCampaignBrief);
  header.append(titleWrap, close);

  // ---- Headline: score + verdict + confidence ----
  const headline = el("div");
  headline.style.display = "flex";
  headline.style.alignItems = "center";
  headline.style.gap = "12px";
  headline.style.margin = "12px 0 2px";

  const scoreBox = el("div", "", String(opts.score.score));
  scoreBox.style.fontSize = "30px";
  scoreBox.style.fontWeight = "800";
  scoreBox.style.lineHeight = "1";
  scoreBox.style.color = BAND_COLOR[opts.score.band];
  scoreBox.style.minWidth = "48px";

  const verdictWrap = el("div");
  const verdict = el("div", "", verdictFallback(opts.score.band));
  verdict.style.fontWeight = "700";
  verdict.style.fontSize = "15px";
  const confidence = el("div", "", t().campaignBriefConfidence(opts.confidence));
  confidence.style.fontSize = "12px";
  confidence.style.color = "#6b7280";
  verdictWrap.append(verdict, confidence);
  headline.append(scoreBox, verdictWrap);

  // ---- Body (loading -> sections / fallback) ----
  const body = el("div");
  const loading = el("div", "", t().campaignBriefLoading);
  loading.style.fontSize = "13px";
  loading.style.color = "#6b7280";
  loading.style.margin = "16px 0";
  body.append(loading);

  // ---- Action bar ----
  const actions = el("div");
  actions.style.display = "flex";
  actions.style.flexWrap = "wrap";
  actions.style.gap = "8px";
  actions.style.marginTop = "16px";

  let latest: { sections: CampaignBriefSections | null; demand: CampaignBriefDemand | null } = {
    sections: null,
    demand: null,
  };

  if (opts.onAccept) {
    const accept = actionButton(t().campaignBriefAccept, true);
    accept.addEventListener("click", () => {
      opts.onAccept?.();
      closeCampaignBrief();
    });
    actions.append(accept);
  }

  const copy = actionButton(t().campaignBriefCopy, false);
  copy.addEventListener("click", () => {
    const text = briefToText(
      opts.brand,
      opts.score,
      opts.confidence,
      latest.sections,
      latest.demand,
      opts.locale,
    );
    void navigator.clipboard?.writeText(text).then(() => {
      copy.textContent = t().campaignBriefCopied;
      window.setTimeout(() => (copy.textContent = t().campaignBriefCopy), 1500);
    });
  });
  actions.append(copy);

  if (opts.onToggleWatch) {
    let watched = opts.watched;
    const watch = actionButton(watched ? t().lastCallWatching : t().lastCallWatch, false);
    watch.addEventListener("click", () => {
      watch.disabled = true;
      void opts.onToggleWatch?.().then((state) => {
        watched = state;
        watch.textContent = watched ? t().lastCallWatching : t().lastCallWatch;
        watch.disabled = false;
      });
    });
    actions.append(watch);
  }

  card.append(header, headline, body, actions);
  backdrop.append(card);
  backdrop.addEventListener("click", closeCampaignBrief);
  root.append(backdrop);
  document.documentElement.append(host);

  // Esc closes.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      closeCampaignBrief();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);

  // Fire the request and render when it lands (guard against a panel that was
  // closed / replaced while the round trip was in flight).
  void opts.request().then((res) => {
    if (openHost !== host) return;
    latest = { sections: res.sections, demand: res.demand };
    renderBody(body, opts, res);
  });
}

function renderBody(body: HTMLElement, opts: CampaignBriefOpen, res: CampaignBriefResult): void {
  body.replaceChildren();
  const sections = res.sections;

  if (!sections) {
    const note = el("div", "", t().campaignBriefError);
    note.style.fontSize = "13px";
    note.style.color = "#6b7280";
    note.style.margin = "12px 0 10px";
    body.append(note, scoreBreakdown(opts.score));
    return;
  }

  if (sections.whyTake.length) {
    body.append(sectionTitle(t().campaignBriefWhy), bulletList(sections.whyTake));
  }
  if (sections.whatToFilm.length) {
    body.append(sectionTitle(t().campaignBriefFilm), bulletList(sections.whatToFilm));
  }
  if (res.demand) {
    body.append(sectionTitle(t().campaignBriefPick));
    const est = money(res.demand.estMonthlyRevenueCents, opts.locale);
    const units = res.demand.estMonthlySales !== null ? String(Math.round(res.demand.estMonthlySales)) : "?";
    const line = el(
      "div",
      "",
      `${res.demand.asin}${est ? ` - ${t().campaignBriefPickEst(units, est)}` : ""}`,
    );
    line.style.fontSize = "13px";
    line.style.fontWeight = "600";
    line.style.color = "#111827";
    body.append(line);
    if (sections.pickReason) body.append(paragraph(sections.pickReason));
  }
  if (sections.onAmazon) {
    body.append(sectionTitle(t().campaignBriefOnAmazon), paragraph(sections.onAmazon));
  }
  if (sections.offAmazon.length) {
    body.append(sectionTitle(t().campaignBriefOffAmazon), bulletList(sections.offAmazon));
  }
  if (sections.audiences.length) {
    const aud = el("div", "", `${t().campaignBriefAudience}: ${sections.audiences.join(", ")}`);
    aud.style.fontSize = "13px";
    aud.style.color = "#374151";
    aud.style.marginTop = "8px";
    body.append(aud);
  }
}
