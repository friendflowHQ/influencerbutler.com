import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { FILTER_HOST_CLASS } from "./dom";
import { HIGH_RATE_PCT, TRIAGE_FILTERS, type TriageFilter } from "./triage";

// The inbox filter bar above the conversation list: All / Unread / Live
// campaign / Pitched by me / 10%+ rate (each with a live count) and a Next unread
// jump. Real buttons with aria-pressed so it is keyboard and screen-reader usable.

const LABELS: Record<TriageFilter, string> = {
  all: "All",
  unread: "Unread",
  live: "Live campaign",
  pitched: "Pitched by me",
  highrate: `${HIGH_RATE_PCT}%+ rate`,
};

export type FilterBarModel = {
  active: TriageFilter;
  counts: Record<TriageFilter, number>;
  total: number;
};

export type FilterBarHandlers = {
  onSelect: (filter: TriageFilter) => void;
  onNextUnread: () => void;
};

export type BuiltFilterBar = {
  host: HTMLElement;
  // Put keyboard focus back on a filter button (the bar is rebuilt when counts
  // change, which would otherwise drop focus mid-use).
  focusFilter: (filter: TriageFilter) => void;
};

export function buildFilterBar(model: FilterBarModel, handlers: FilterBarHandlers): BuiltFilterBar {
  const { host, root } = createInlineShadow(FILTER_HOST_CLASS);
  const bar = el("div", "ccm-filters");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Filter conversations");
  const buttons = new Map<TriageFilter, HTMLButtonElement>();

  for (const filter of TRIAGE_FILTERS) {
    const btn = el("button", "ccm-filter");
    buttons.set(filter, btn);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(model.active === filter));
    if (model.active === filter) btn.classList.add("on");
    btn.append(el("span", "ccm-filter-label", LABELS[filter]));
    btn.append(el("span", "ccm-filter-count", String(filter === "all" ? model.total : model.counts[filter])));
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSelect(filter);
    });
    bar.append(btn);
  }

  if (model.counts.unread > 0) {
    const next = el("button", "ccm-filter ccm-next", "Next unread");
    next.type = "button";
    next.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onNextUnread();
    });
    bar.append(next);
  }

  root.addEventListener("click", (event) => event.stopPropagation());
  root.append(bar);
  return { host, focusFilter: (filter) => buttons.get(filter)?.focus() };
}

// A signature of the model, so the sweep only rebuilds the bar when something
// the creator can see has changed.
export function filterBarSignature(model: FilterBarModel): string {
  return `${model.active}|${model.total}|${TRIAGE_FILTERS.map((f) => model.counts[f]).join(",")}`;
}
