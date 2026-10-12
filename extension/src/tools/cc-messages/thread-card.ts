import { t } from "../../i18n";
import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { CARD_HOST_CLASS } from "./dom";
import type { BrandSummary } from "./brand-index";
import type { MessageLink } from "./links";
import { MAX_NOTE_CHARS } from "./notes";
import { endsLabel, formatRate } from "./strip";

// The brand card between the "Messages with X" header and the conversation: what
// the brand is offering right now (rate, days left, slots meter), the sample-form
// and content links pulled out of its message, the creator's own note about the
// brand, and quick actions. Everything shows only what is known: with no campaign
// data it collapses to the note and a one-line hint.

export type CardModel = {
  brand: string;
  summary: BrandSummary | null;
  // From the desktop app when it answered (extras, never required). The cadence
  // arrives already translated.
  cadence?: string | null;
  risky?: boolean;
  pitchedKeyword?: string | null;
  links: MessageLink[];
  note: string;
  accepted: boolean;
  // Why Accept is unavailable ("" when it is available).
  acceptBlockedReason: string;
  // Absolute URL of the campaign detail page for the best campaign, or null.
  campaignUrl: string | null;
};

export type CardHandlers = {
  onSaveNote: (text: string) => void;
  // Resolves with the line to show after the accept attempt, and whether it worked.
  onAccept: () => Promise<{ ok: boolean; message: string }>;
};

// Cheap signature of everything the card shows, so a sweep rebuilds it only when
// it changed (a rebuild would drop focus from the note field).
export function cardSignature(model: CardModel): string {
  const s = model.summary;
  return [
    model.brand,
    s ? `${s.bestRatePct}|${s.endsInDays}|${s.openSlots}|${s.slotsTaken}|${s.slotsTotal}|${s.allClaimed}|${s.spccCampaigns}` : "-",
    model.cadence ?? "",
    model.pitchedKeyword ?? "",
    model.links.map((l) => l.url).join(","),
    model.accepted ? "a" : "",
    model.acceptBlockedReason,
    model.campaignUrl ?? "",
  ].join("~");
}

export function buildCard(model: CardModel, handlers: CardHandlers): HTMLElement {
  const strings = t();
  const { host, root } = createInlineShadow(CARD_HOST_CLASS);
  const card = el("section", "ccm-card");
  card.setAttribute("aria-label", strings.ccmCardSummary(model.brand));
  // Never let a click on the card reach Amazon's widget handlers.
  root.addEventListener("click", (event) => event.stopPropagation());
  root.addEventListener("keydown", (event) => event.stopPropagation());

  const s = model.summary;

  // Headline: rate + cadence + the pitched keyword.
  const head = el("div", "ccm-card-head");
  if (s && typeof s.bestRatePct === "number" && s.bestRatePct > 0) {
    const text = model.cadence ? `${formatRate(s.bestRatePct)}% · ${model.cadence}` : `${formatRate(s.bestRatePct)}%`;
    head.append(el("span", `ccm-pill ${model.risky ? "warn" : "rate"}`, text));
  }
  if (model.accepted) head.append(el("span", "ccm-pill good", strings.ccmPillAccepted));
  if (model.pitchedKeyword) {
    const kw = el("span", "ccm-pill kw", `🔍 ${model.pitchedKeyword}`);
    kw.title = strings.ccmCardPitchedTip;
    head.append(kw);
  }
  if (head.childElementCount > 0) card.append(head);

  // Facts: days left, slots meter.
  if (s) {
    const facts = el("div", "ccm-facts");
    if (s.allClaimed) {
      facts.append(el("span", "ccm-fact", strings.ccmAllSlotsTaken));
    } else {
      if (typeof s.endsInDays === "number") facts.append(el("span", "ccm-fact", endsLabel(s.endsInDays)));
      if (typeof s.openSlots === "number" && s.openSlots > 0) {
        facts.append(el("span", "ccm-fact", strings.ccmSlotsOpen(s.openSlots)));
      }
    }
    if (s.liveCampaigns > 1) facts.append(el("span", "ccm-fact", strings.ccmLiveCampaigns(s.liveCampaigns)));
    if (s.spccCampaigns > 0) facts.append(el("span", "ccm-fact", strings.ccmSpccCampaign));
    if (facts.childElementCount > 0) card.append(facts);

    if (typeof s.slotsTaken === "number" && typeof s.slotsTotal === "number" && s.slotsTotal > 0) {
      const pct = Math.min(100, Math.round((s.slotsTaken / s.slotsTotal) * 100));
      const meter = el("div", "ccm-meter");
      meter.setAttribute("role", "img");
      meter.setAttribute("aria-label", strings.ccmMeterLabel(s.slotsTaken, s.slotsTotal));
      const bar = el("div", "ccm-meter-fill");
      bar.style.width = `${pct}%`;
      meter.append(bar);
      card.append(meter);
    }
  } else {
    card.append(el("p", "ccm-hint", strings.ccmNoCampaignData));
  }

  // Links from the brand's message.
  if (model.links.length > 0) {
    const row = el("div", "ccm-links");
    row.append(el("span", "ccm-row-label", strings.ccmFromMessage));
    for (const link of model.links) {
      const a = el("a", `ccm-link ${link.kind}`, link.label);
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = link.display;
      row.append(a);
    }
    card.append(row);
  }

  // Actions.
  const actions = el("div", "ccm-actions");
  const status = el("span", "ccm-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  if (s && !model.accepted) {
    const accept = el("button", "ccm-btn primary", strings.ccmAcceptBest);
    accept.type = "button";
    if (model.acceptBlockedReason) {
      accept.disabled = true;
      accept.title = model.acceptBlockedReason;
    }
    accept.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      accept.disabled = true;
      status.textContent = strings.ccmAccepting;
      const result = await handlers.onAccept();
      status.textContent = result.message;
      accept.disabled = result.ok;
      if (result.ok) accept.textContent = strings.ccmPillAccepted;
    });
    actions.append(accept);
  }
  if (model.campaignUrl) {
    const open = el("a", "ccm-btn", strings.ccmOpenCampaign);
    open.href = model.campaignUrl;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    actions.append(open);
  }
  const copy = el("button", "ccm-btn", strings.ccmCopyBrand);
  copy.type = "button";
  copy.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(model.brand);
      status.textContent = strings.ccmCopied;
    } catch {
      status.textContent = strings.ccmCopyFailed;
    }
  });
  actions.append(copy, status);
  card.append(actions);

  // Note: a real labelled input, saved on Enter or when focus leaves.
  const noteRow = el("label", "ccm-note");
  noteRow.append(el("span", "ccm-row-label", strings.ccmNote));
  const input = el("input", "ccm-note-input");
  input.type = "text";
  input.maxLength = MAX_NOTE_CHARS;
  input.placeholder = strings.ccmNotePlaceholder;
  input.value = model.note;
  let saved = model.note;
  const commit = () => {
    if (input.value === saved) return;
    saved = input.value;
    handlers.onSaveNote(input.value);
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      input.blur();
    }
  });
  noteRow.append(input);
  card.append(noteRow);

  root.append(card);
  return host;
}
