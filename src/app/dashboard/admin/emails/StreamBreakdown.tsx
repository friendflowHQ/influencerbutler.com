"use client";

// Cold vs warm click-through breakdown for the Emails overview. The blended
// dashboard CTR is dragged down by cold, unsolicited lists; this splits the
// recent window into cold outreach vs warm (known-audience) mail so each can be
// read on its own. Fetches /api/admin/emails/streams and shares the 7/30/90-day
// window with the rest of the overview via the `days` prop.

import { useEffect, useState } from "react";

type StreamKey = "cold" | "warm" | "transactional";

type StreamAggregate = {
  key: StreamKey;
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

type StreamsResponse = {
  days: number;
  streams: StreamAggregate[];
  migrationPending?: boolean;
};

/** Open/click denominator: delivered when we have it, else sent (delivery
 * events can lag while the webhook is new). Matches the overview's openBase. */
function base(a: StreamAggregate): number {
  return a.delivered > 0 ? a.delivered : a.sent;
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** One decimal, for the small CTR gaps where whole percents round away the
 * difference (cold ~1% vs warm ~5% both survive, but 1.2 vs 0.8 would not). */
function pct1(numerator: number, denominator: number): string {
  if (denominator <= 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

// Per-bucket accent so cold reads as the problem child and warm as the healthy
// baseline, without inventing new colors outside the dashboard's palette.
const ACCENT: Record<StreamKey, { ring: string; num: string; dot: string }> = {
  cold: { ring: "border-rose-200", num: "text-rose-600", dot: "bg-rose-400" },
  warm: { ring: "border-emerald-200", num: "text-emerald-600", dot: "bg-emerald-400" },
  transactional: { ring: "border-slate-200", num: "text-slate-600", dot: "bg-slate-300" },
};

export default function StreamBreakdown({ days }: { days: number }) {
  const [data, setData] = useState<StreamsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/emails/streams?days=${days}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as StreamsResponse;
        if (!cancelled) setData(json);
      } catch {
        // panel stays empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading && !data) {
    return <div className="h-28 animate-pulse rounded-xl bg-slate-100" />;
  }
  if (!data || data.streams.length === 0) return null;

  const byKey = new Map(data.streams.map((s) => [s.key, s]));
  const cold = byKey.get("cold");
  const warm = byKey.get("warm");

  // Blended = cold + warm marketing (transactional excluded: near-100% opens on
  // receipts and login links would flatter the average and hide the real story).
  const marketing = data.streams.filter((s) => s.key !== "transactional");
  const blendedClicked = marketing.reduce((n, s) => n + s.clicked, 0);
  const blendedBase = marketing.reduce((n, s) => n + base(s), 0);

  const takeaway =
    cold && warm && base(cold) > 0 && base(warm) > 0
      ? `Blended marketing click rate ${pct1(blendedClicked, blendedBase)}: cold ${pct1(
          cold.clicked,
          base(cold),
        )} vs warm ${pct1(warm.clicked, base(warm))}. The all-audience average hides that gap.`
      : "Cold outreach and warm mail are averaged together in the headline numbers; split out here so each reads on its own.";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{takeaway}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.streams.map((s) => {
          const accent = ACCENT[s.key];
          const denom = base(s);
          return (
            <div key={s.key} className={`rounded-lg border ${accent.ring} bg-white p-3`}>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${accent.dot}`} />
                <span className="text-xs font-medium text-slate-500">{s.label}</span>
              </div>
              <p className={`mt-1.5 text-3xl font-extrabold ${accent.num}`}>
                {pct1(s.clicked, denom)}
              </p>
              <p className="text-xs text-slate-400">click rate</p>
              <dl className="mt-2 space-y-0.5 text-xs text-slate-500">
                <div className="flex justify-between">
                  <dt>Open rate</dt>
                  <dd className="font-medium text-slate-700">{pct(s.opened, denom)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Delivered</dt>
                  <dd className="font-medium text-slate-700">{s.delivered.toLocaleString("en-US")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Sent</dt>
                  <dd className="font-medium text-slate-700">{s.sent.toLocaleString("en-US")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Bounced</dt>
                  <dd className="font-medium text-slate-700">{pct(s.bounced, s.sent)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
