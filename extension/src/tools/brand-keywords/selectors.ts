// The swappable DOM layer for the Creator Connections Messages widget. Amazon
// ships no stable data-testids on this floating panel, so everything here reads
// by structure and text and is deliberately isolated in one file: when Amazon
// reshapes the widget, only this file changes.
//
// STATUS: heuristics below are confirmed against the live widget during QA (see
// the plan's verification step). Keep each reader defensive - a miss returns
// null/[] and the sweep simply mounts no chip rather than throwing.

// Relative/absolute timestamps Amazon renders on the right of each list row
// ("1 hour ago", "12:41 AM", "Yesterday", "2 days ago"). Used to strip the
// timestamp when isolating the brand name from a row's text.
const TIMESTAMP_RE =
  /^(?:\d{1,2}:\d{2}\s*(?:am|pm)?|(?:a|\d+)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|yesterday|today|just now)$/i;

// The floating panel. Anchor on its "Messages" title, then climb to the panel
// container that holds both the conversation list and the open thread.
export function findMessagesWidget(doc: Document): HTMLElement | null {
  const title = findByExactText(doc.body, "Messages");
  if (!title) return null;
  // Climb to the smallest ancestor that also contains conversation rows or the
  // thread body, i.e. the whole panel rather than just the header bar.
  let node: HTMLElement | null = title;
  for (let depth = 0; node && depth < 6; depth += 1) {
    if (node.querySelector("[data-ib-bkw-widget], img, a, textarea")) {
      // Heuristic: the panel body has interactive content (avatars, links, the
      // reply box) the bare header bar does not.
      return node;
    }
    node = node.parentElement;
  }
  return title.parentElement;
}

// The conversation rows in the list view. Each row is the clickable ancestor of
// a brand name + a timestamp. Returns [] in thread view.
export function findConversationRows(widget: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  // Timestamps are the most reliable row marker: find each timestamp leaf, then
  // climb to the row container that also carries the brand name.
  for (const leaf of Array.from(widget.querySelectorAll<HTMLElement>("*"))) {
    if (leaf.children.length > 0) continue;
    const text = (leaf.textContent ?? "").trim();
    if (!text || !TIMESTAMP_RE.test(text)) continue;
    const row = climbToRow(leaf, widget);
    if (row && !seen.has(row)) {
      seen.add(row);
      rows.push(row);
    }
  }
  return rows;
}

// The brand name shown on one list row: the row's text minus its timestamp and
// any preview snippet. Reads the most prominent (first) non-timestamp text leaf.
export function readListRowBrand(row: HTMLElement): string | null {
  for (const leaf of Array.from(row.querySelectorAll<HTMLElement>("*"))) {
    if (leaf.children.length > 0) continue;
    const text = (leaf.textContent ?? "").trim();
    if (!text || TIMESTAMP_RE.test(text)) continue;
    return text;
  }
  return null;
}

// The "Messages with <BRAND>" header of the open thread, or null in list view.
export function findThreadHeader(widget: HTMLElement): HTMLElement | null {
  return findByTextPrefix(widget, "Messages with ");
}

// The brand name from the thread header, stripping the localized prefix.
export function readThreadBrand(header: HTMLElement): string | null {
  const text = (header.textContent ?? "").trim();
  const stripped = text.replace(/^messages with\s+/i, "").trim();
  return stripped && stripped.toLowerCase() !== "messages with" ? stripped : null;
}

// ── internal helpers ─────────────────────────────────────────────────────────

// Climb from a timestamp leaf to the row container: the highest ancestor still
// scoped to a single conversation (stop before an ancestor that holds more than
// one timestamp, which would be the list, not a row).
function climbToRow(leaf: HTMLElement, widget: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = leaf.parentElement;
  let best: HTMLElement | null = null;
  for (let depth = 0; node && node !== widget && depth < 6; depth += 1) {
    if (countTimestamps(node) > 1) break;
    best = node;
    node = node.parentElement;
  }
  return best;
}

function countTimestamps(node: HTMLElement): number {
  let count = 0;
  for (const leaf of Array.from(node.querySelectorAll<HTMLElement>("*"))) {
    if (leaf.children.length > 0) continue;
    const text = (leaf.textContent ?? "").trim();
    if (text && TIMESTAMP_RE.test(text)) count += 1;
  }
  return count;
}

function findByExactText(root: HTMLElement, text: string): HTMLElement | null {
  const target = text.toLowerCase();
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (node.children.length > 0) continue;
    if ((node.textContent ?? "").trim().toLowerCase() === target) return node;
  }
  return null;
}

function findByTextPrefix(root: HTMLElement, prefix: string): HTMLElement | null {
  const target = prefix.toLowerCase();
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (node.children.length > 0) continue;
    if ((node.textContent ?? "").trim().toLowerCase().startsWith(target)) return node;
  }
  return null;
}
