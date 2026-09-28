import overlayCss from "./overlay.css";
import { UI_PREFIX } from "../shared/constants";
import { el } from "./components";
import { t } from "../i18n";
import type { WhatsNewView } from "../shared/messages";
import logoUrl from "../../static/icons/icon-48.png";

// The post-update "What's New" corner card: a dismissible card in the
// bottom-right showing what changed in the version that just installed. Like the
// update banner, it mounts in its own closed shadow host so an SPA panel rebuild
// (which calls removeHost()) never tears it down.

export type WhatsNewHandlers = {
  // Dismiss / close clicked. The caller messages the background to advance the
  // stored "last shown version" so the notice stops on every surface.
  onDismiss: () => void;
};

let container: HTMLElement | null = null;

export function isWhatsNewCardMounted(): boolean {
  return container !== null && container.isConnected;
}

export function removeWhatsNewCard(): void {
  container?.remove();
  container = null;
}

export function showWhatsNewCard(view: WhatsNewView, handlers: WhatsNewHandlers): void {
  if (isWhatsNewCardMounted()) return;

  container = document.createElement("div");
  container.className = `${UI_PREFIX}-whatsnew-host`;
  const root = container.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.append(style);

  const card = el("div", "whats-new-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", t().whatsNewTitle);

  const dismiss = () => {
    handlers.onDismiss();
    removeWhatsNewCard();
  };

  card.append(
    header(view),
    body(view),
    footer(dismiss),
    closeButton(dismiss),
  );

  root.append(card);
  document.documentElement.append(container);
}

function header(view: WhatsNewView): HTMLElement {
  const head = el("div", "whats-new-head");
  const dot = el("img", "dot");
  dot.src = logoUrl;
  dot.alt = "";
  const text = el("div", "whats-new-headtext");
  text.append(el("strong", "whats-new-title", t().whatsNewTitle));
  // "Version 0.1.9 - August 25, 2026" (date omitted when the changelog has none).
  const meta = view.date ? `v${view.version} - ${view.date}` : `v${view.version}`;
  text.append(el("span", "whats-new-meta", meta));
  head.append(dot, text);
  return head;
}

// The corner card keeps only the top few of each list so it stays skimmable
// (the popup card shows the full lists). "Other Notable Changes" is popup-only.
const MAX_ITEMS = 3;

function body(view: WhatsNewView): HTMLElement {
  const wrap = el("div", "whats-new-body");
  const features = view.features.slice(0, MAX_ITEMS);
  const fixes = view.fixes.slice(0, MAX_ITEMS);
  const bugs = view.reportedBugs.slice(0, MAX_ITEMS);
  if (features.length) wrap.append(section(t().whatsNewFeaturesHeading, features));
  if (fixes.length) wrap.append(section(t().whatsNewFixesHeading, fixes));
  if (bugs.length) {
    wrap.append(section(t().whatsNewReportedHeading, bugs.map((b) => b.summary)));
  }
  return wrap;
}

function section(heading: string, items: string[]): HTMLElement {
  const sec = el("div", "whats-new-section");
  sec.append(el("h4", "whats-new-heading", heading));
  const list = el("ul", "whats-new-list");
  for (const item of items) list.append(el("li", undefined, item));
  sec.append(list);
  return sec;
}

function footer(onDismiss: () => void): HTMLElement {
  const row = el("div", "whats-new-actions");
  const btn = el("button", "btn", t().whatsNewDismiss);
  btn.type = "button";
  btn.addEventListener("click", onDismiss);
  row.append(btn);
  return row;
}

function closeButton(onDismiss: () => void): HTMLButtonElement {
  const close = el("button", "whats-new-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t().nudgeCloseLabel);
  close.addEventListener("click", onDismiss);
  return close;
}
