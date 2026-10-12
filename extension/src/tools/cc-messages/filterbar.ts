import { t } from "../../i18n";
import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { FILTER_HOST_CLASS } from "./dom";
import { HIGH_RATE_PCT, TRIAGE_FILTERS, type TriageFilter } from "./triage";

// The inbox filter bar above the conversation list: a brand search box, the
// filter chips (All / Unread / Brand replied / Waiting on brand / Live campaign /
// Pitched by me / 10%+ rate, each with a live count), a Next unread jump, a line
// saying how fresh the full-inbox read is, and a one-line reason when the active
// filter keeps nothing. Real buttons with aria-pressed so it is keyboard and
// screen-reader usable. The counts cover the whole inbox (read from the chat
// API) narrowed to the search, while Amazon's drawer renders at most 100 rows;
// the conversations it leaves out are listed below the rows (more-list.ts).

export type FilterBarModel = {
  active: TriageFilter;
  counts: Record<TriageFilter, number>;
  total: number;
  query: string;
  // Why the active filter (or search) shows nothing; "" when rows are showing.
  emptyReason: string;
  // "1,480 conversations, updated 2 min ago"; "" hides the line.
  sync: string;
};

export type FilterBarHandlers = {
  onSelect: (filter: TriageFilter) => void;
  onNextUnread: () => void;
  onSearch: (query: string) => void;
  // Enter in the search box: open the first match.
  onSearchEnter: () => void;
};

export type BuiltFilterBar = {
  host: HTMLElement;
  // Put keyboard focus back on a filter button (the bar is rebuilt when counts
  // change, which would otherwise drop focus mid-use).
  focusFilter: (filter: TriageFilter) => void;
  focusSearch: () => void;
  isSearchFocused: () => boolean;
};

const SEARCH_DEBOUNCE_MS = 150;

function label(filter: TriageFilter): string {
  const s = t();
  switch (filter) {
    case "all":
      return s.ccmFilterAll;
    case "unread":
      return s.ccmFilterUnread;
    case "replied":
      return s.ccmFilterReplied;
    case "waiting":
      return s.ccmFilterWaiting;
    case "live":
      return s.ccmFilterLive;
    case "pitched":
      return s.ccmFilterPitched;
    case "highrate":
      return s.ccmFilterHighRate(HIGH_RATE_PCT);
  }
}

export function formatCount(n: number, locale: string): string {
  try {
    return n.toLocaleString(locale);
  } catch {
    return String(n);
  }
}

export function buildFilterBar(model: FilterBarModel, handlers: FilterBarHandlers, locale: string): BuiltFilterBar {
  const s = t();
  const { host, root } = createInlineShadow(FILTER_HOST_CLASS);
  // The host sits in Amazon's own list, so it is pinned with inline styles
  // (the shadow stylesheet cannot reach it). Harmless where sticky cannot apply.
  host.style.position = "sticky";
  host.style.top = "0";
  host.style.zIndex = "1";
  host.style.background = "#ffffff";

  const wrap = el("div", "ccm-filterbar");

  // Search box.
  const search = el("div", "ccm-search");
  const input = el("input", "ccm-search-input");
  input.type = "search";
  input.placeholder = s.ccmSearchPlaceholder;
  input.setAttribute("aria-label", s.ccmSearchLabel);
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = model.query;
  let debounce: number | null = null;
  input.addEventListener("input", () => {
    if (debounce !== null) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      debounce = null;
      handlers.onSearch(input.value);
    }, SEARCH_DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (debounce !== null) {
        window.clearTimeout(debounce);
        debounce = null;
        handlers.onSearch(input.value);
      }
      handlers.onSearchEnter();
    } else if (event.key === "Escape" && input.value) {
      event.preventDefault();
      input.value = "";
      handlers.onSearch("");
    }
  });
  search.append(input);
  if (model.query) {
    const clear = el("button", "ccm-search-clear", "×");
    clear.type = "button";
    clear.setAttribute("aria-label", s.ccmSearchClear);
    clear.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSearch("");
    });
    search.append(clear);
  }
  wrap.append(search);

  // Filter chips.
  const bar = el("div", "ccm-filters");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", s.ccmFilterBarLabel);
  const buttons = new Map<TriageFilter, HTMLButtonElement>();
  for (const filter of TRIAGE_FILTERS) {
    const count = filter === "all" ? model.total : model.counts[filter];
    const btn = el("button", "ccm-filter");
    buttons.set(filter, btn);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(model.active === filter));
    if (model.active === filter) btn.classList.add("on");
    if (count === 0 && filter !== "all") btn.classList.add("empty");
    btn.append(el("span", "ccm-filter-label", label(filter)));
    btn.append(el("span", "ccm-filter-count", formatCount(count, locale)));
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSelect(filter);
    });
    bar.append(btn);
  }
  if (model.counts.unread > 0) {
    const next = el("button", "ccm-filter ccm-next", s.ccmNextUnread);
    next.type = "button";
    next.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onNextUnread();
    });
    bar.append(next);
  }
  wrap.append(bar);

  if (model.emptyReason) {
    const empty = el("p", "ccm-empty", model.emptyReason);
    empty.setAttribute("role", "status");
    wrap.append(empty);
  }
  if (model.sync) wrap.append(el("p", "ccm-sync", model.sync));

  root.addEventListener("click", (event) => event.stopPropagation());
  root.addEventListener("keydown", (event) => event.stopPropagation());
  root.append(wrap);
  return {
    host,
    focusFilter: (filter) => buttons.get(filter)?.focus(),
    focusSearch: () => {
      input.focus();
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        // type=search supports it in Chrome; ignore elsewhere
      }
    },
    isSearchFocused: () => root.activeElement === input,
  };
}

// A signature of the model, so the sweep only rebuilds the bar when something
// the creator can see has changed.
export function filterBarSignature(model: FilterBarModel): string {
  return [
    model.active,
    model.total,
    TRIAGE_FILTERS.map((f) => model.counts[f]).join(","),
    model.query,
    model.emptyReason,
    model.sync,
  ].join("|");
}
