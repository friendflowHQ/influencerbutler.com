"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { WorkspaceIcon } from "@/components/workspace-icon";

type HelpSearchItem = {
  id: string;
  title: string;
  category: string;
  summary: string;
  text: string;
};

function TutorialCard({ item }: { item: HelpSearchItem }) {
  return (
    <Link
      href={`/help/tutorials/${item.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-5 transition hover:border-orange-500 hover:shadow"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-orange-50 text-orange-600">
        <WorkspaceIcon id={item.id} />
      </span>
      <h3 className="mt-4 font-semibold text-slate-900">{item.title}</h3>
      {item.summary ? <p className="mt-2 text-sm text-slate-600">{item.summary}</p> : null}
    </Link>
  );
}

export function HelpSearch({ items }: { items: HelpSearchItem[] }) {
  const [query, setQuery] = useState("");

  // Match when every whitespace-delimited term appears somewhere in the
  // tutorial's title, summary, category, or body text.
  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return null;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.category} ${item.text}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, HelpSearchItem[]>();
    for (const item of items) {
      const key = item.category || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div>
      <div className="mt-8">
        <label htmlFor="help-search" className="sr-only">
          Search tutorials
        </label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tutorials by keyword..."
          className="w-full max-w-xl rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        {matches ? (
          <p className="mt-2 text-sm text-slate-500">
            {matches.length} {matches.length === 1 ? "result" : "results"} for &ldquo;{query.trim()}&rdquo;
          </p>
        ) : null}
      </div>

      {matches ? (
        matches.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((item) => (
              <TutorialCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="mt-12 rounded border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No tutorials match that search. Try a different keyword.
          </p>
        )
      ) : (
        <div className="mt-10 grid gap-10">
          {grouped.map(([category, entries]) => (
            <section key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                {category}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((item) => (
                  <TutorialCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
