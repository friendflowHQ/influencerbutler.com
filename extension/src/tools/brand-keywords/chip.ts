import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import type { OutreachRecord } from "./types";

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
