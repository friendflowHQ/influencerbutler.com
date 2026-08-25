import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import type { BrandEnrichmentRecord, OutreachRecord } from "./types";

// Build the keyword pill inside its own inline shadow host so Amazon's widget
// styles never touch it. Glyph + latest keyword; the full tooltip carries the
// send date and any earlier keywords.
function buildChipHost(record: OutreachRecord): HTMLElement {
  const { host, root } = createInlineShadow("bkw-chip-host");
  const chip = el("span", "bkw-chip");
  chip.append(el("span", "bkw-glyph", "🔍"), el("span", "bkw-kw", record.keyword));
  chip.title = tooltipFor(record);
  root.append(chip);
  return host;
}

function tooltipFor(record: OutreachRecord): string {
  let tip = `Messaged under "${record.keyword}"`;
  const when = formatDate(record.lastSentAt);
  if (when) tip += ` on ${when}`;
  const others = record.keywords.filter((k) => k && k !== record.keyword);
  if (others.length > 0) tip += `. Also: ${others.join(", ")}`;
  return tip;
}

function formatDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export function mountRowChip(anchor: HTMLElement, record: OutreachRecord): void {
  anchor.append(buildChipHost(record));
}

export function mountThreadChip(header: HTMLElement, record: OutreachRecord): void {
  header.append(buildChipHost(record));
}

// ── Inbound-brand chip ───────────────────────────────────────────────────────
// For a conversation the creator never pitched, show the brand's Creator
// Connections signal from the global index: best commission rate + a short
// cadence word (e.g. "12% · renews"). A distinct glyph and a "risky" tint keep
// it visually apart from the orange keyword chip.

// Friendly one-word cadence labels. Unknown/absent cadences render nothing, so
// the chip falls back to the rate alone.
const CADENCE_LABEL: Record<string, string> = {
  renews: "renews",
  occasional: "occasional",
  "one-shot": "one-time",
};

function buildEnrichmentChipHost(record: BrandEnrichmentRecord): HTMLElement {
  const { host, root } = createInlineShadow("bkw-chip-host");
  const chip = el("span", "bkw-chip bkw-chip-enrich");
  if (record.verdict === "risky") chip.classList.add("bkw-chip-risky");
  chip.append(el("span", "bkw-glyph", "📊"), el("span", "bkw-kw", enrichmentText(record)));
  chip.title = enrichmentTooltip(record);
  root.append(chip);
  return host;
}

// The chip's visible text: rate then cadence, joined by a middle dot. Callers
// only mount when this is non-empty (guaranteed by hasEnrichmentSignal upstream).
function enrichmentText(record: BrandEnrichmentRecord): string {
  const parts: string[] = [];
  if (typeof record.bestRatePct === "number" && record.bestRatePct > 0) {
    parts.push(`${formatRate(record.bestRatePct)}%`);
  }
  const cadence = record.cadence ? CADENCE_LABEL[record.cadence] : undefined;
  if (cadence) parts.push(cadence);
  return parts.join(" · ");
}

function enrichmentTooltip(record: BrandEnrichmentRecord): string {
  let tip = "Runs Creator Connections campaigns.";
  if (typeof record.bestRatePct === "number" && record.bestRatePct > 0) {
    tip += ` Best rate ${formatRate(record.bestRatePct)}%.`;
  }
  const bits: string[] = [];
  if (typeof record.distinctCampaigns === "number" && record.distinctCampaigns > 0) {
    bits.push(`${record.distinctCampaigns} campaign${record.distinctCampaigns === 1 ? "" : "s"}`);
  }
  if (typeof record.slotsOpen === "number" && record.slotsOpen > 0) {
    bits.push(`${record.slotsOpen} open slot${record.slotsOpen === 1 ? "" : "s"}`);
  }
  if (typeof record.latestEndsInDays === "number" && record.latestEndsInDays >= 0) {
    bits.push(`ends in ${record.latestEndsInDays} day${record.latestEndsInDays === 1 ? "" : "s"}`);
  }
  if (bits.length > 0) tip += ` ${bits.join(", ")}.`;
  return tip;
}

// Trim a trailing ".0" so "10.0" reads as "10" but "12.5" is kept.
function formatRate(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

export function mountRowEnrichmentChip(anchor: HTMLElement, record: BrandEnrichmentRecord): void {
  anchor.append(buildEnrichmentChipHost(record));
}

export function mountThreadEnrichmentChip(header: HTMLElement, record: BrandEnrichmentRecord): void {
  header.append(buildEnrichmentChipHost(record));
}
