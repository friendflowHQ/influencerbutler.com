"use client";

import { useMemo, useState } from "react";

type Platform = "instagram" | "tiktok" | "youtube";

// Rough industry benchmark bands (engagement rate as a %). Ordered low to high;
// the first band whose `max` is not exceeded wins.
const BENCHMARKS: Record<
  Platform,
  { label: string; bands: { max: number; verdict: string; tone: string }[] }
> = {
  instagram: {
    label: "Instagram",
    bands: [
      { max: 1, verdict: "Below average", tone: "text-slate-500" },
      { max: 3, verdict: "Average", tone: "text-amber-600" },
      { max: 6, verdict: "Good", tone: "text-emerald-600" },
      { max: Infinity, verdict: "Excellent", tone: "text-emerald-600" },
    ],
  },
  tiktok: {
    label: "TikTok",
    bands: [
      { max: 3, verdict: "Below average", tone: "text-slate-500" },
      { max: 9, verdict: "Average", tone: "text-amber-600" },
      { max: 15, verdict: "Good", tone: "text-emerald-600" },
      { max: Infinity, verdict: "Excellent", tone: "text-emerald-600" },
    ],
  },
  youtube: {
    label: "YouTube",
    bands: [
      { max: 1, verdict: "Below average", tone: "text-slate-500" },
      { max: 3, verdict: "Average", tone: "text-amber-600" },
      { max: 5, verdict: "Good", tone: "text-emerald-600" },
      { max: Infinity, verdict: "Excellent", tone: "text-emerald-600" },
    ],
  },
};

const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube"];

export default function EngagementRateClient() {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [followers, setFollowers] = useState(10000);
  const [likes, setLikes] = useState(400);
  const [comments, setComments] = useState(25);

  const rate = useMemo(() => {
    if (followers <= 0) return null;
    return ((likes + comments) / followers) * 100;
  }, [followers, likes, comments]);

  const verdict = useMemo(() => {
    if (rate == null) return null;
    return BENCHMARKS[platform].bands.find((b) => rate <= b.max) ?? null;
  }, [rate, platform]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-8 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <div>
            <span className="block text-sm font-medium text-slate-700">Platform</span>
            <div
              className="mt-2 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="group"
              aria-label="Platform"
            >
              {PLATFORMS.map((p) => {
                const active = p === platform;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    aria-pressed={active}
                    className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                      active
                        ? "bg-[#f97316] text-white shadow-sm"
                        : "text-slate-600 hover:text-[#f97316]"
                    }`}
                  >
                    {BENCHMARKS[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          <NumberField
            id="followers"
            label="Followers (or subscribers)"
            value={followers}
            onChange={setFollowers}
          />
          <NumberField
            id="likes"
            label="Average likes per post"
            value={likes}
            onChange={setLikes}
          />
          <NumberField
            id="comments"
            label="Average comments per post"
            value={comments}
            onChange={setComments}
          />

          <p className="text-xs text-slate-500">
            Engagement rate = (average likes + average comments) ÷ followers × 100. Use your typical
            recent posts for the best read.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your engagement rate
          </p>
          <p className="text-6xl font-bold tracking-tight text-[#f97316]">
            {rate != null ? `${rate.toFixed(2)}%` : "-"}
          </p>
          {verdict ? (
            <p className={`text-lg font-semibold ${verdict.tone}`}>
              {verdict.verdict} for {BENCHMARKS[platform].label}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Enter your followers to see your rate.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Benchmarks are rough industry ranges and vary by niche and audience size.
          </p>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none"
      />
    </div>
  );
}
