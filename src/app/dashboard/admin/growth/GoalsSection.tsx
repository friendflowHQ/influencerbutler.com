"use client";

// Monthly goals: auto-suggested targets to accept/tweak/dismiss, accepted
// goals as progress cards, and a one-time confetti when a goal is hit.

import { useCallback, useEffect, useState } from "react";
import {
  catalogEntry,
  formatMetricValue,
  type CatalogEntry,
} from "./format";

type Goal = {
  id: string;
  metric: string;
  target: number;
  baseline: number | null;
  status: "suggested" | "accepted" | "dismissed";
  achievedAt: string | null;
  celebratedAt: string | null;
  current: number | null;
  needsCelebration: boolean;
};

type GoalsResponse = {
  month?: string;
  migrationPending?: boolean;
  goals?: Goal[];
  error?: string;
};

const CARD_ACCENTS = [
  { bar: "bg-indigo-500", ring: "border-indigo-200" },
  { bar: "bg-emerald-500", ring: "border-emerald-200" },
  { bar: "bg-sky-500", ring: "border-sky-200" },
  { bar: "bg-violet-500", ring: "border-violet-200" },
  { bar: "bg-orange-500", ring: "border-orange-200" },
];

export default function GoalsSection({
  month,
  catalog,
  onCelebrate,
}: {
  month: string;
  catalog: CatalogEntry[] | null;
  onCelebrate: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/growth/goals?month=${month}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as GoalsResponse;
      setData(json);

      // Fire confetti exactly once per goal: celebrate, then stamp.
      const toCelebrate = (json.goals ?? []).filter((g) => g.needsCelebration);
      if (toCelebrate.length > 0) {
        onCelebrate();
        await Promise.all(
          toCelebrate.map((g) =>
            fetch("/api/admin/growth/goals", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: g.id, action: "celebrated" }),
            }).catch(() => null),
          ),
        );
      }
    } catch {
      // section renders empty on failure
    } finally {
      setLoading(false);
    }
  }, [month, onCelebrate]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        await fetch("/api/admin/growth/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } finally {
        void load();
      }
    },
    [load],
  );

  const goals = data?.goals ?? [];
  const accepted = goals.filter((g) => g.status === "accepted");
  const suggested = goals.filter((g) => g.status === "suggested");

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
        Goals this month
      </h2>
      {data?.migrationPending ? (
        <p className="mt-1 text-xs text-amber-700">
          Goals need the growth tables: run 20260705_growth_dashboard.sql in the Supabase SQL
          editor to light this up.
        </p>
      ) : null}

      {loading ? (
        <div className="mt-3 h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      ) : (
        <>
          {accepted.length === 0 && suggested.length === 0 && !data?.migrationPending ? (
            <p className="mt-3 text-sm text-slate-500">
              No goals yet for this month. Suggestions appear automatically on the first visit each
              month.
            </p>
          ) : null}

          {accepted.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accepted.map((g, i) => {
                const entry = catalogEntry(catalog, g.metric);
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                const fraction =
                  g.current !== null && g.target > 0 ? Math.min(1, g.current / g.target) : 0;
                const hit = g.achievedAt !== null;
                return (
                  <div
                    key={g.id}
                    className={[
                      "relative rounded-xl border bg-white p-4",
                      hit ? "border-amber-300 ring-2 ring-amber-200" : accent.ring,
                    ].join(" ")}
                  >
                    {hit ? (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow-sm">
                        Hit! 🎉
                      </span>
                    ) : null}
                    <p className="text-xs font-medium text-slate-500">{entry.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {formatMetricValue(entry.unit, g.current)}
                      <span className="text-sm font-medium text-slate-400">
                        {" "}
                        / {formatMetricValue(entry.unit, g.target)}
                      </span>
                    </p>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${hit ? "bg-amber-400" : accent.bar}`}
                        style={{ width: `${Math.round(fraction * 100)}%`, transition: "width 700ms ease" }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-slate-400">{Math.round(fraction * 100)}% there</p>
                      {editingId === g.id ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const target = Number(editValue);
                            if (Number.isFinite(target) && target > 0) {
                              const cents = entry.unit === "cents" ? Math.round(target * 100) : target;
                              void patch({ id: g.id, action: "set_target", target: cents });
                            }
                            setEditingId(null);
                          }}
                        >
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            inputMode="decimal"
                            className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                            aria-label="New target"
                          />
                          <button type="submit" className="text-xs font-medium text-indigo-600">
                            Save
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(g.id);
                            setEditValue(
                              String(entry.unit === "cents" ? g.target / 100 : g.target),
                            );
                          }}
                          className="text-xs font-medium text-slate-400 hover:text-indigo-600"
                        >
                          Edit target
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {suggested.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Suggested for you
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {suggested.map((g) => {
                  const entry = catalogEntry(catalog, g.metric);
                  return (
                    <div
                      key={g.id}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                    >
                      <p className="text-sm text-amber-900">
                        <span className="font-semibold">
                          {formatMetricValue(entry.unit, g.target)}
                        </span>{" "}
                        {entry.goalLabel}
                        {g.baseline !== null && g.baseline > 0 ? (
                          <span className="text-amber-700/70">
                            {" "}
                            (last month: {formatMetricValue(entry.unit, g.baseline)})
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void patch({ id: g.id, action: "accept" })}
                          className="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-500"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void patch({ id: g.id, action: "dismiss" })}
                          className="text-xs font-medium text-amber-700 hover:text-amber-900"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
