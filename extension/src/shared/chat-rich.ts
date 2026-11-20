/**
 * Small DOM helpers shared by the two extension chat surfaces (the full-tab
 * assistant and the in-page bubble): clickable links in answers, "Read the full
 * guide" chips, a video link and a book-a-call link, and a thumbs up/down row.
 * Plain document.createElement only, so it works inside the bubble's shadow DOM.
 */
import type { AiChatSource, AiChatVideo, AiChatBooking } from "./messages";

const LINK_HOSTS = new Set(["influencerbutler.com", "www.influencerbutler.com", "youtube.com", "www.youtube.com", "youtu.be"]);
const LINK_RE = /\[([^\]]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s)<>]+)/g;
const BOOK_URL = "https://www.influencerbutler.com/dashboard/book";

/** https URLs on our site or YouTube only; anything else stays plain text. */
export function safeHref(raw: string): string | null {
  if (raw.startsWith("/") && !raw.startsWith("//")) return `https://www.influencerbutler.com${raw}`;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && LINK_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

function anchor(href: string, text: string, className?: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  if (className) a.className = className;
  return a;
}

/** Write answer text into `parent`, turning markdown and bare allowed links into anchors. */
export function appendRichText(parent: HTMLElement, text: string): void {
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const at = m.index ?? 0;
    const href = safeHref(m[2] ?? m[3] ?? "");
    if (at > last) parent.append(document.createTextNode(text.slice(last, at)));
    if (href) parent.append(anchor(href, m[1] ?? m[3] ?? href));
    else parent.append(document.createTextNode(m[0]));
    last = at + m[0].length;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

export type RichLabels = { watchVideo: string; readGuide: string; bookCall: string };

/** Chips under an answer: guides it was grounded on, a video, and a book-a-call link. */
export function appendAnswerChips(
  parent: HTMLElement,
  extras: { sources?: AiChatSource[]; video?: AiChatVideo; booking?: AiChatBooking },
  labels: RichLabels,
): void {
  for (const s of extras.sources || []) {
    if (safeHref(s.url)) parent.append(anchor(s.url, `${labels.readGuide}: ${s.title}`, "chip"));
  }
  if (extras.video && safeHref(extras.video.url)) {
    parent.append(anchor(extras.video.url, `${labels.watchVideo}: ${extras.video.title || ""}`.replace(/: $/, ""), "chip"));
  }
  if (extras.booking && extras.booking.callTypes && extras.booking.callTypes.length) {
    for (const ct of extras.booking.callTypes) {
      const mins = ct.userMinutes ? ` (${ct.userMinutes} min)` : "";
      parent.append(anchor(BOOK_URL, `${labels.bookCall}: ${ct.label}${mins}`, "chip"));
    }
  }
}

export type FeedbackLabels = { helpedYes: string; helpedNo: string; thanksFeedback: string };

/**
 * A thumbs up/down row. `onRate` is called once with the rating; the row then
 * swaps itself for the thank-you note.
 */
export function buildFeedbackRow(labels: FeedbackLabels, onRate: (rating: "up" | "down") => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "fb";
  const make = (rating: "up" | "down", glyph: string, label: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = glyph;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.onclick = () => {
      onRate(rating);
      row.textContent = labels.thanksFeedback;
      row.setAttribute("role", "status");
    };
    return b;
  };
  row.append(make("up", "\u{1F44D}", labels.helpedYes), make("down", "\u{1F44E}", labels.helpedNo));
  return row;
}
