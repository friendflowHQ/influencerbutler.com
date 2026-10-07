// The swappable DOM layer for the richer Messages drawer. Amazon ships no stable
// testids on this floating panel, so everything here reads by structure, text and
// computed style, and is isolated in one file next to brand-keywords/selectors.ts
// (the list-row and header readers live there). Every reader is defensive: a miss
// returns null/[]/false and the caller renders nothing rather than throwing.
//
// STATUS: the list-row readers were verified live (2026-09-09). The thread bubble
// reader, the unread-dot reader and the stacked-container placement below are
// heuristics written against the screenshots of the drawer and are NOT yet
// confirmed on the live DOM (live QA is the first thing to do with a build).

import { normalizeBrand } from "../brand-keywords/normalize";
import type { ThreadMessage } from "./dupes";
import { isUnreadDotColor } from "./triage";

// Every shadow-host class this feature (and the older Messages tools) injects.
export const OWN_HOST_SELECTOR = [
  ".bkw-chip-host",
  ".bkw-hint-host",
  ".mtpl-host",
  ".ccm-strip-host",
  ".ccm-card-host",
  ".ccm-filter-host",
  ".ccm-dupe-host",
].join(", ");

export const STRIP_HOST_CLASS = "ccm-strip-host";
export const CARD_HOST_CLASS = "ccm-card-host";
export const FILTER_HOST_CLASS = "ccm-filter-host";
export const DUPE_HOST_CLASS = "ccm-dupe-host";

const TIME_RE = /^\d{1,2}:\d{2}\s*(?:am|pm)$/i;

// ── placement ────────────────────────────────────────────────────────────────

// True when `parent` lays its children out top to bottom, so a block inserted as
// one of its children lands on its own line instead of becoming a column.
function stacksVertically(parent: HTMLElement): boolean {
  let cs: CSSStyleDeclaration;
  try {
    cs = getComputedStyle(parent);
  } catch {
    return false;
  }
  const display = cs.display;
  if (display.includes("flex")) return cs.flexDirection.startsWith("column");
  if (display.includes("grid")) return false;
  return display === "block" || display === "flow-root" || display === "list-item";
}

// Insert `host` next to `start` on its own line: climb from `start` to the
// nearest ancestor whose parent stacks its children vertically, and place the host
// right after (or before) that ancestor. Climbing stops at `boundary`, so the
// worst case is "directly after the whole row", never somewhere outside the
// widget. Returns false when the host could not be placed.
export function insertOnOwnLine(
  start: HTMLElement,
  boundary: HTMLElement,
  host: HTMLElement,
  where: "after" | "before" = "after",
): boolean {
  let node: HTMLElement = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = node.parentElement;
    if (!parent) return false;
    if (stacksVertically(parent) || node === boundary) {
      if (where === "after") node.after(host);
      else node.before(host);
      return true;
    }
    node = parent;
  }
  return false;
}

// ── list view ────────────────────────────────────────────────────────────────

// Amazon marks an unread conversation with a small solid red dot (no attribute).
// Find a small leaf-sized element with a red background inside the row.
export function readRowUnread(row: HTMLElement): boolean {
  for (const node of Array.from(row.querySelectorAll<HTMLElement>("*"))) {
    if (node.children.length > 0 || (node.textContent ?? "").trim()) continue;
    if (node.closest(OWN_HOST_SELECTOR)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 4 || rect.width > 16 || rect.height < 4 || rect.height > 16) continue;
    try {
      if (isUnreadDotColor(getComputedStyle(node).backgroundColor)) return true;
    } catch {
      // detached node; ignore
    }
  }
  return false;
}

// ── thread view ──────────────────────────────────────────────────────────────

export type ThreadBubble = ThreadMessage & {
  // The outermost element that holds exactly this one message (name, time, text).
  el: HTMLElement;
};

function textNodesOf(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
    const parent = node.parentElement;
    if (text && parent && !parent.closest(OWN_HOST_SELECTOR) && !parent.closest("textarea")) {
      out.push(text);
    }
    node = walker.nextNode();
  }
  return out;
}

function timeLeaves(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const leaf of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (leaf.children.length > 0) continue;
    if (leaf.closest(OWN_HOST_SELECTOR)) continue;
    if (TIME_RE.test((leaf.textContent ?? "").trim())) out.push(leaf);
  }
  return out;
}

function countTimes(node: HTMLElement): number {
  return timeLeaves(node).length;
}

function sameBrand(a: string, b: string): boolean {
  const x = normalizeBrand(a);
  const y = normalizeBrand(b);
  if (!x || !y) return false;
  return x === y || x.replace(/\s+/g, "") === y.replace(/\s+/g, "");
}

// The open thread's messages, oldest first. Each is found from its "10:31 AM"
// time label: the message container is the outermost ancestor that still holds
// exactly one time label. The sender is the first other text in it (the brand's
// name on its own messages); the text is everything after that.
export function readThreadBubbles(widget: HTMLElement, brand: string | null): ThreadBubble[] {
  const bubbles: ThreadBubble[] = [];
  const seen = new Set<HTMLElement>();
  for (const time of timeLeaves(widget)) {
    let best: HTMLElement | null = null;
    let node: HTMLElement | null = time.parentElement;
    for (let depth = 0; node && node !== widget && depth < 6; depth += 1) {
      if (countTimes(node) > 1) break;
      best = node;
      node = node.parentElement;
    }
    if (!best || seen.has(best)) continue;
    seen.add(best);

    const parts = textNodesOf(best);
    const timeText = (time.textContent ?? "").trim();
    const timeAt = parts.indexOf(timeText);
    const rest = parts.filter((_, i) => i !== timeAt);
    // The sender label is the short first line; a message with no label (a run of
    // messages under one header) starts straight with its text.
    const first = rest[0] ?? "";
    const looksLikeName = rest.length > 1 && first.length <= 40;
    const name = looksLikeName ? first : "";
    const body = (looksLikeName ? rest.slice(1) : rest).join("\n");
    let sender: ThreadMessage["sender"] = "unknown";
    if (name) sender = brand && sameBrand(name, brand) ? "brand" : "me";
    bubbles.push({ el: best, sender, text: body });
  }
  return bubbles;
}

// Every piece of text in the open thread, for link extraction when the bubble
// reader found nothing. Excludes our own UI and the composer.
export function readThreadText(widget: HTMLElement): string {
  return textNodesOf(widget).join(" ");
}

// ── folding ──────────────────────────────────────────────────────────────────

const HIDDEN_ATTR = "data-ib-ccm-hidden";

// Hide a duplicate bubble. The attribute holds a signature of the text that was
// hidden: React reuses DOM nodes across threads, so a node that now shows a
// DIFFERENT message must be revealed again (see reconcileHidden).
export function hideBubble(el: HTMLElement, signature: string): void {
  el.setAttribute(HIDDEN_ATTR, signature);
  el.style.display = "none";
}

export function showBubble(el: HTMLElement): void {
  el.removeAttribute(HIDDEN_ATTR);
  el.style.removeProperty("display");
}

export function hiddenSignature(el: HTMLElement): string | null {
  return el.getAttribute(HIDDEN_ATTR);
}

export function restoreAllHidden(root: ParentNode): void {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`))) {
    showBubble(node);
  }
}
