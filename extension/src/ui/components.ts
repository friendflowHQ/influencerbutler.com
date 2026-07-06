import { getShadowRoot } from "./host";
import { t } from "../i18n";

// The floating panel is shared by every tool on a page: each tool adds a
// section, so exactly one UI root exists no matter how many tools run.
let panel: HTMLElement | null = null;
let body: HTMLElement | null = null;

export function getPanel(title: string): HTMLElement {
  const root = getShadowRoot();
  if (panel && panel.isConnected) return body as HTMLElement;
  panel = el("div", "panel");
  const header = el("div", "header");
  const dot = el("span", "dot");
  const titleEl = el("span", "title");
  titleEl.textContent = title;
  const chev = el("span", "chev");
  chev.textContent = t().panelChevronHide;
  header.append(dot, titleEl, chev);
  header.addEventListener("click", () => {
    panel?.classList.toggle("collapsed");
    chev.textContent = panel?.classList.contains("collapsed") ? t().panelChevronShow : t().panelChevronHide;
  });
  body = el("div", "body");
  panel.append(header, body);
  root.append(panel);
  return body;
}

export function addSection(heading: string): HTMLElement {
  const container = getPanel("Influencer Butler");
  const section = el("div", "section");
  const h = el("h4");
  h.textContent = heading;
  section.append(h);
  container.append(section);
  return section;
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
