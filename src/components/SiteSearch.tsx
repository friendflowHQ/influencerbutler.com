"use client";

/**
 * Site-wide search box with an as-you-type results dropdown, calling
 * /api/search (the same endpoint the static homepage header uses).
 *
 * Variants:
 *  - "header": a magnifier icon that expands into a search field on click. The
 *    marketing header carries ~11 nav links, so a permanent inline box has no
 *    room; the field opens as an overlay anchored to the right instead.
 *  - "inline": an always-visible compact field (used inside the mobile menu).
 *  - "page":   an always-visible larger field (used atop the /search page).
 *
 * All variants share one debounced fetch, keyboard navigation, and the "see all
 * results" fallback to the /search page. Styling mirrors the marketing chrome.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SiteSearchType = "blog" | "help" | "feature" | "page";

type Result = {
  id: string;
  type: SiteSearchType;
  title: string;
  summary: string;
  category: string;
  url: string;
  image: string | null;
};

const TYPE_LABEL: Record<SiteSearchType, string> = {
  feature: "Feature",
  page: "Page",
  help: "Help",
  blog: "Blog",
};

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function SiteSearch({
  variant = "header",
  initialQuery = "",
  autoFocus = false,
  className = "",
  onNavigate,
}: {
  variant?: "header" | "inline" | "page";
  initialQuery?: string;
  autoFocus?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  // Header variant only: whether the field is expanded out of the icon.
  const [expanded, setExpanded] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch. Two-character minimum matches the API guard.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results?: Result[] };
        setResults(Array.isArray(data.results) ? data.results : []);
        setActive(-1);
      } catch {
        // Ignore aborted/failed requests; keep the last good results.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  // Close (and, for the header variant, collapse) on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (variant === "header") setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [variant]);

  function go(url: string) {
    setOpen(false);
    setExpanded(false);
    onNavigate?.();
    router.push(url);
  }

  function goToSearchPage() {
    const q = query.trim();
    if (q.length === 0) return;
    go(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) {
        setOpen(true);
        setActive((i) => (i + 1) % results.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) {
        setOpen(true);
        setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && results[active]) {
        go(results[active].url);
      } else {
        goToSearchPage();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      if (variant === "header") setExpanded(false);
    }
  }

  const showPanel = open && query.trim().length >= 2;
  const inputSize = variant === "page" ? "px-4 py-3 text-base" : "px-3.5 py-2 text-sm";

  // Header variant, collapsed: just the magnifier button.
  if (variant === "header" && !expanded) {
    return (
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          type="button"
          aria-label="Search the site"
          aria-expanded={false}
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:border-orange-500 hover:text-orange-500"
        >
          <SearchGlyph className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const panelPosition =
    variant === "page" ? "left-0 right-0" : "right-0 w-80";

  const fieldWrapper =
    variant === "header"
      ? "absolute right-0 top-1/2 z-50 w-80 -translate-y-1/2"
      : "relative";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className={fieldWrapper}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (open && active >= 0 && results[active]) go(results[active].url);
            else goToSearchPage();
          }}
        >
          <div className="relative">
            <SearchGlyph className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              autoFocus={autoFocus || variant === "header"}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder="Search the site..."
              aria-label="Search the site"
              aria-expanded={showPanel}
              aria-controls={listId}
              aria-autocomplete="list"
              role="combobox"
              className={`w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 ${inputSize}`}
            />
          </div>
        </form>

        {showPanel ? (
          <div
            id={listId}
            role="listbox"
            className={`absolute z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ${panelPosition}`}
          >
            {results.length > 0 ? (
              <>
                <ul className="max-h-[70vh] overflow-y-auto py-1">
                  {results.map((r, i) => (
                    <li key={r.id} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(r.url)}
                        className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${
                          i === active ? "bg-orange-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="mt-0.5 inline-flex shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                          {TYPE_LABEL[r.type]}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {r.title}
                          </span>
                          {r.summary ? (
                            <span className="mt-0.5 line-clamp-1 block text-xs text-slate-500">
                              {r.summary}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={goToSearchPage}
                  className="block w-full border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-left text-sm font-semibold text-orange-600 hover:bg-slate-100"
                >
                  See all results for &ldquo;{query.trim()}&rdquo;
                </button>
              </>
            ) : (
              <div className="px-4 py-4 text-sm text-slate-500">
                {loading ? "Searching..." : "No results. Press Enter to search the full site."}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SiteSearch;
