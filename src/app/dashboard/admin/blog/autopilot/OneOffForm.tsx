"use client";

// Queue a single timely post: title, keywords, date, and optionally "generate
// the morning it publishes" plus research URLs the writer reads for freshness
// (e.g. a Black Friday trends roundup).

import { useState } from "react";
import { AUTOPILOT_CATEGORIES, type AutopilotData } from "./autopilot-types";

type Props = {
  data: AutopilotData;
  onSaved: () => void;
  onClose: () => void;
};

export default function OneOffForm({ data, onSaved, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [category, setCategory] = useState<string>("Deals");
  const [publishDate, setPublishDate] = useState("");
  const [dayOf, setDayOf] = useState(false);
  const [brief, setBrief] = useState("");
  const [urls, setUrls] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blog/autopilot/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          keywords,
          category,
          publishDate,
          dayOf,
          brief: brief || undefined,
          researchUrls: urls.filter((u) => u.trim()),
          expectedHeadSha: data.headSha,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#f97316] focus:outline-none";

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-6" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">One-off post</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">
            Close
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Topic / working title
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Trending products to search deals on for Black Friday"'
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Target keywords (comma-separated)
            <input
              className={inputClass}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="black friday amazon deals, trending products black friday, ..."
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              Category
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {AUTOPILOT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Publish date
              <input
                type="date"
                className={inputClass}
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={dayOf} onChange={(e) => setDayOf(e.target.checked)} />
            Generate the morning it publishes (freshest content; skips the review window)
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Brief for the writer (optional)
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Angles to cover, which butlers to feature, what to avoid..."
            />
          </label>
          <div>
            <span className="block text-xs font-medium text-slate-600">
              Research URLs (optional, up to 3): fetched at generation time so the post can cite
              current information
            </span>
            {urls.map((url, index) => (
              <input
                key={index}
                className={inputClass}
                value={url}
                onChange={(e) =>
                  setUrls((prev) => prev.map((u, i) => (i === index ? e.target.value : u)))
                }
                placeholder="https://..."
              />
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy || !title.trim() || !keywords.trim() || !publishDate}
              onClick={save}
              className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              {busy ? "Queueing..." : "Queue post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
