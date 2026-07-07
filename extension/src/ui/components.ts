import { getShadowRoot } from "./host";
import { t } from "../i18n";
import { sendToBackground } from "../shared/messages";
import logoUrl from "../../static/icons/icon-48.png";

// The floating panel is shared by every tool on a page: each tool adds a
// section, so exactly one UI root exists no matter how many tools run.
let panel: HTMLElement | null = null;
let body: HTMLElement | null = null;

export function getPanel(title: string): HTMLElement {
  const root = getShadowRoot();
  if (panel && panel.isConnected) return body as HTMLElement;
  panel = el("div", "panel");
  const header = el("div", "header");
  const dot = el("img", "dot");
  dot.src = logoUrl;
  dot.alt = "";
  const titleEl = el("span", "title");
  titleEl.textContent = title;
  const gear = gearButton();
  const chev = el("span", "chev");
  chev.textContent = t().panelChevronHide;
  header.append(dot, titleEl, gear, chev);
  header.addEventListener("click", () => {
    panel?.classList.toggle("collapsed");
    chev.textContent = panel?.classList.contains("collapsed") ? t().panelChevronShow : t().panelChevronHide;
  });
  body = el("div", "body");
  panel.append(header, body);
  root.append(panel);
  return body;
}

// The gear in the header opens the full settings/options page (OpenAI key,
// affiliate + deeplink connections, and every other integration). It sits in
// the header but must not toggle the panel, so its click is stopped short.
function gearButton(): HTMLButtonElement {
  const btn = el("button", "gear") as HTMLButtonElement;
  btn.type = "button";
  btn.title = t().panelSettings;
  btn.setAttribute("aria-label", t().panelSettings);
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' +
    "</svg>";
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    void sendToBackground({ kind: "OPEN_OPTIONS" });
  });
  return btn;
}

export function addSection(heading: string, info?: string): HTMLElement {
  const container = getPanel("Influencer Butler");
  const section = el("div", "section");
  const h = el("h4");
  h.textContent = heading;
  if (info) h.append(infoTip(info));
  section.append(h);
  container.append(section);
  return section;
}

// A small "i" affordance that reveals explanatory copy on hover or focus,
// so long-winded help text does not clutter the panel until it is wanted.
export function infoTip(text: string): HTMLElement {
  const tip = el("span", "infotip");
  tip.tabIndex = 0;
  tip.setAttribute("role", "img");
  tip.setAttribute("aria-label", text);
  tip.append(el("span", "infotip-mark", "i"), el("span", "infotip-bubble", text));
  return tip;
}

// A disclosure block: a clickable label row with an orange caret that toggles
// a content region, mirroring the desktop app's expandable sections. Returns
// the content element to append children to (the container is added to `parent`).
export function collapsible(
  parent: HTMLElement,
  label: string,
  opts: { open?: boolean } = {},
): HTMLElement {
  const container = el("div", "disclosure");
  const head = el("button", "disclosure-head") as HTMLButtonElement;
  head.type = "button";
  const caret = el("span", "disclosure-caret", "▾");
  caret.setAttribute("aria-hidden", "true");
  const content = el("div", "disclosure-body");
  head.append(caret, el("span", "disclosure-label", label));
  const setOpen = (open: boolean) => {
    container.classList.toggle("open", open);
    head.setAttribute("aria-expanded", String(open));
  };
  head.addEventListener("click", () =>
    setOpen(!container.classList.contains("open")),
  );
  setOpen(opts.open ?? true);
  container.append(head, content);
  parent.append(container);
  return content;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function chip(className: string, text: string): HTMLElement {
  return el("span", `chip ${className}`, text);
}

// A small "Copy" affordance next to a value (ASIN, etc). Copies to the
// clipboard and briefly confirms. Stops propagation so it never toggles the
// panel or triggers a parent row's click.
export function copyButton(value: string): HTMLButtonElement {
  const btn = el("button", "copy-btn");
  btn.type = "button";
  btn.textContent = t().copy;
  btn.setAttribute("aria-label", `${t().copy}: ${value}`);
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        btn.textContent = t().copied;
        btn.classList.add("copied");
        window.setTimeout(() => {
          btn.textContent = t().copy;
          btn.classList.remove("copied");
        }, 1200);
      })
      .catch(() => {
        // clipboard blocked (rare): leave the label unchanged
      });
  });
  return btn;
}

export function criteriaList(
  rows: Array<{ label: string; state: "pass" | "fail" | "unknown" }>,
): HTMLElement {
  const ul = el("ul", "criteria");
  for (const row of rows) {
    const li = el("li", row.state);
    const mark = el("span", "mark", row.state === "pass" ? "Y" : row.state === "fail" ? "N" : "?");
    li.append(mark, document.createTextNode(row.label));
    ul.append(li);
  }
  return ul;
}
