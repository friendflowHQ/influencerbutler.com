import { t } from "../../i18n";
import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { MORE_HOST_CLASS } from "./dom";
import { formatCount } from "./filterbar";

// The conversations Amazon's drawer does not render (it stops at 100 rows),
// listed after the drawer's own rows so the list keeps reading newest to oldest.
// Each row copies the drawer's anatomy (avatar, brand, when, chevron) and opens
// the conversation through open-conversation.ts. A "Show more" button pages the
// list instead of a hard cap.

export type MoreRow = { brandKey: string; brand: string; when: string; unread: boolean };

export type MoreListModel = {
  items: MoreRow[];
  // How many matching conversations sit past the current page.
  hidden: number;
  // How many "Show more" adds at a time.
  step: number;
};

export type MoreListHandlers = {
  onOpen: (brand: string) => void;
  onShowMore: () => void;
};

export function buildMoreList(model: MoreListModel, handlers: MoreListHandlers, locale: string): HTMLElement {
  const s = t();
  const { host, root } = createInlineShadow(MORE_HOST_CLASS);
  const section = el("section", "ccm-more");
  const total = model.items.length + model.hidden;
  const header = el("h3", "ccm-more-head", s.ccmOlderHeader(formatCount(total, locale)));
  section.setAttribute("aria-label", header.textContent ?? "");
  section.append(header);

  const list = el("ul", "ccm-more-list");
  for (const item of model.items) {
    const li = el("li", "ccm-more-item");
    const btn = el("button", "ccm-more-open");
    btn.type = "button";
    btn.setAttribute("aria-label", s.ccmOpenConversation(item.brand));
    const avatar = el("span", "ccm-more-avatar", initialOf(item.brand));
    avatar.setAttribute("aria-hidden", "true");
    btn.append(avatar);
    const body = el("span", "ccm-more-body");
    const name = el("span", "ccm-more-brand");
    if (item.unread) name.append(el("span", "ccm-more-dot"));
    name.append(el("span", "ccm-more-brand-text", item.brand));
    body.append(name);
    btn.append(body);
    if (item.when) btn.append(el("span", "ccm-more-when", item.when));
    const chevron = el("span", "ccm-more-chevron", "›");
    chevron.setAttribute("aria-hidden", "true");
    btn.append(chevron);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onOpen(item.brand);
    });
    li.append(btn);
    list.append(li);
  }
  section.append(list);

  if (model.hidden > 0) {
    const more = el(
      "button",
      "ccm-btn ccm-more-btn",
      s.ccmShowMore(formatCount(Math.min(model.step, model.hidden), locale), formatCount(model.hidden, locale)),
    );
    more.type = "button";
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onShowMore();
    });
    section.append(more);
  }

  root.addEventListener("click", (event) => event.stopPropagation());
  root.append(section);
  return host;
}

function initialOf(brand: string): string {
  const ch = brand.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

export function moreListSignature(model: MoreListModel): string {
  const rows = model.items.map((m) => `${m.brandKey}${m.unread ? "!" : ""}:${m.when}`).join(",");
  return `${model.hidden}|${model.step}|${rows}`;
}
