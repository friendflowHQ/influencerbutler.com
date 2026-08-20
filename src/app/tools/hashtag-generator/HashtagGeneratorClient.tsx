"use client";

import { useMemo, useState } from "react";
import { buildHashtags, NICHE_SUGGESTIONS } from "@/lib/hashtag-bank";

export default function HashtagGeneratorClient() {
  const [keyword, setKeyword] = useState("");
  const [count, setCount] = useState(20);
  const [copied, setCopied] = useState(false);

  const tags = useMemo(() => buildHashtags(keyword, count), [keyword, count]);
  const asText = tags.join(" ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-6 p-8">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="keyword">
            Product or niche keyword
          </label>
          <input
            id="keyword"
            type="text"
            value={keyword}
            placeholder="e.g. kitchen gadgets, skincare, home office"
            onChange={(e) => setKeyword(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-[#f97316]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {NICHE_SUGGESTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setKeyword(n)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-[#f97316] hover:text-[#f97316]"
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="count">
            Number of hashtags: {count}
          </label>
          <input
            id="count"
            type="range"
            min={5}
            max={30}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-3 w-full accent-[#f97316]"
          />
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your hashtags
            </p>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              {copied ? "Copied!" : "Copy all"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-orange-100 bg-white px-3 py-1 text-sm font-medium text-slate-700"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            A blend of broad reach tags, niche tags, and Amazon shopping tags. Swap in a few that fit
            your exact product before you post.
          </p>
        </div>
      </div>
    </div>
  );
}
