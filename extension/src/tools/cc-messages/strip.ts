import { t } from "../../i18n";
import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { STRIP_HOST_CLASS } from "./dom";

// The status strip under a conversation's brand name: one wrapping line of small
// pills (pitched keyword, rate + cadence, SPCC, days left, open slots, accepted,
// note). One block-level shadow host per row, placed on its own line by dom.ts,
// so it never floats over Amazon's timestamp and chevron the way the old
// end-of-row chip did.

export type StripModel = {
  // The search keyword the desktop Message Brands tool pitched this brand under.
  keyword?: { text: string; tip: string } | null;
  ratePct?: number | null;
  // The translated cadence word ("renews" / "occasional" / "one-time") from the
  // desktop app's answer, when it answered.
  cadence?: string | null;
  risky?: boolean;
  endsInDays?: number | null;
  openSlots?: number | null;
  allClaimed?: boolean;
  accepted?: boolean;
  // The brand has a live Sponsored Products for Creators (SPCC) campaign.
  spcc?: boolean;
  note?: string | null;
};

type Pill = { cls: string; glyph?: string; text: string; tip?: string };

export function formatRate(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

export function endsLabel(days: number): string {
  if (days <= 0) return t().ccmEndsToday;
  return t().ccmEndsIn(days);
}

function pillsFor(model: StripModel): Pill[] {
  const s = t();
  const pills: Pill[] = [];
  if (model.keyword) {
    pills.push({ cls: "kw", glyph: "🔍", text: model.keyword.text, tip: model.keyword.tip });
  }
  if (model.accepted) {
    pills.push({ cls: "good", text: s.ccmPillAccepted, tip: s.ccmPillAcceptedTip });
  }
  const rateBits: string[] = [];
  if (typeof model.ratePct === "number" && model.ratePct > 0) rateBits.push(`${formatRate(model.ratePct)}%`);
  if (model.cadence) rateBits.push(model.cadence);
  if (rateBits.length > 0) {
    pills.push({
      cls: model.risky ? "warn" : "rate",
      glyph: "📊",
      text: rateBits.join(" · "),
      tip: s.ccmPillRateTip,
    });
  }
  if (model.spcc) {
    pills.push({ cls: "rate", text: s.ccmPillSpcc, tip: s.ccmPillSpccTip });
  }
  if (model.allClaimed) {
    pills.push({ cls: "muted", text: s.ccmPillFull, tip: s.ccmPillFullTip });
  } else {
    if (typeof model.endsInDays === "number") {
      pills.push({
        cls: model.endsInDays <= 2 ? "warn" : "muted",
        text: endsLabel(model.endsInDays),
        tip: s.ccmEndsTip,
      });
    }
    if (typeof model.openSlots === "number" && model.openSlots > 0) {
      pills.push({
        cls: "muted",
        text: s.ccmSlotsLeft(model.openSlots),
        tip: s.ccmSlotsLeftTip,
      });
    }
  }
  if (model.note) {
    pills.push({ cls: "note", glyph: "📝", text: clip(model.note, 28), tip: model.note });
  }
  return pills;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// A stable string for what the strip shows, so the sweep can skip a row whose
// strip is already current and rebuild one whose data changed.
export function stripSignature(model: StripModel): string {
  return pillsFor(model)
    .map((p) => `${p.cls}:${p.text}`)
    .join("|");
}

// Returns null when there is nothing to show (no pills): the row stays clean.
export function buildStrip(model: StripModel): HTMLElement | null {
  const pills = pillsFor(model);
  if (pills.length === 0) return null;
  const { host, root } = createInlineShadow(STRIP_HOST_CLASS);
  const strip = el("div", "ccm-strip");
  for (const pill of pills) {
    const node = el("span", `ccm-pill ${pill.cls}`);
    if (pill.glyph) node.append(el("span", "ccm-glyph", pill.glyph));
    node.append(el("span", "ccm-pill-text", pill.text));
    if (pill.tip) node.title = pill.tip;
    strip.append(node);
  }
  root.append(strip);
  return host;
}
