"use client";

// Three-step campaign creation: theme form -> AI-proposed editable topic list
// -> schedule preview + confirm. The proposal never commits; only Confirm
// saves the campaign + items into the queue.

import { useState } from "react";
import {
  AUTOPILOT_CATEGORIES,
  type AutopilotData,
  type ProposedTopic,
} from "./autopilot-types";

type Props = {
  data: AutopilotData;
  onSaved: () => void;
  onClose: () => void;
};

type CampaignDraft = {
  id: string;
  theme: string;
  notes?: string;
  cadenceDays: number;
  categoryMix: string[];
};

export default function CampaignWizard({ data, onSaved, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(10);
  const [cadenceDays, setCadenceDays] = useState(7);
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft | null>(null);
  const [topics, setTopics] = useState<ProposedTopic[]>([]);

  const propose = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blog/autopilot/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          notes: notes || undefined,
          count,
          cadenceDays,
          startDate: startDate || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Proposal failed (${res.status})`);
      setCampaignDraft(json.campaignDraft as CampaignDraft);
      setTopics(json.proposedItems as ProposedTopic[]);
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!campaignDraft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blog/autopilot/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: campaignDraft,
          items: topics,
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

  const updateTopic = (index: number, patch: Partial<ProposedTopic>) => {
    setTopics((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#f97316] focus:outline-none";

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-6" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            New campaign {step > 1 ? `- step ${step} of 3` : ""}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">
            Close
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-slate-600">
              Campaign theme
              <textarea
                className={`${inputClass} min-h-[70px]`}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder='e.g. "30 posts about Instagram influencer tricks and tactics, weaving in our butlers where they help"'
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Notes for the writer (optional)
              <textarea
                className={`${inputClass} min-h-[50px]`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tone, angles to hit or avoid, must-mention features..."
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-xs font-medium text-slate-600">
                Posts
                <input
                  type="number"
                  min={1}
                  max={60}
                  className={inputClass}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 1)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Every N days
                <input
                  type="number"
                  min={1}
                  max={30}
                  className={inputClass}
                  value={cadenceDays}
                  onChange={(e) => setCadenceDays(Number(e.target.value) || 1)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Start date (optional)
                <input
                  type="date"
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || !theme.trim()}
                onClick={propose}
                className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
              >
                {busy ? "Proposing topics..." : "Propose topics with AI"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4">
            <p className="text-sm text-slate-600">
              Edit titles, keywords, and categories; remove topics you do not want. Dates are
              re-checked at the next step.
            </p>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {topics.map((topic, index) => (
                <div key={topic.slug} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm font-medium"
                        value={topic.title}
                        onChange={(e) => updateTopic(index, { title: e.target.value })}
                      />
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                        value={topic.keywords}
                        onChange={(e) => updateTopic(index, { keywords: e.target.value })}
                      />
                      <textarea
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                        value={topic.summary}
                        onChange={(e) => updateTopic(index, { summary: e.target.value })}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <select
                        className="rounded border border-slate-200 px-1 py-1 text-xs"
                        value={topic.category}
                        onChange={(e) => updateTopic(index, { category: e.target.value })}
                      >
                        {AUTOPILOT_CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-400">{topic.publishDate}</span>
                      <button
                        type="button"
                        onClick={() => setTopics((prev) => prev.filter((_, i) => i !== index))}
                        className="text-xs text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!topics.length}
                onClick={() => setStep(3)}
                className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
              >
                Review schedule ({topics.length} posts)
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4">
            <p className="text-sm text-slate-600">
              These dates were allocated into open slots around your existing scheduled posts
              (max {data.settings.maxPerDay}/day). Final dates are re-validated on save. Each
              post is generated {data.settings.leadDays} day(s) before it publishes and emailed
              to you for a look before it goes live.
            </p>
            <div className="mt-3 max-h-[380px] overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Publish</th>
                    <th className="px-3 py-2">Generate</th>
                    <th className="px-3 py-2">Title</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((topic) => (
                    <tr key={topic.slug} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-medium text-slate-900">{topic.publishDate}</td>
                      <td className="px-3 py-1.5 text-slate-500">{topic.generateOn}</td>
                      <td className="max-w-md truncate px-3 py-1.5 text-slate-700">{topic.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
              >
                {busy ? "Saving..." : `Queue ${topics.length} posts`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
