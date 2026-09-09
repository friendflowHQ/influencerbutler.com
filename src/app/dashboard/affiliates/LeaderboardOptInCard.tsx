"use client";

import { useEffect, useState } from "react";

/**
 * Lets an approved affiliate choose whether their handle is shown on the public
 * /leaderboard. Off by default: the board shows masked initials until they opt
 * in here. Reads and writes /api/affiliates/leaderboard-optin.
 */
export default function LeaderboardOptInCard() {
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/affiliates/leaderboard-optin")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d) => {
        if (!cancelled) setOptIn(d.optIn === true);
      })
      .catch(() => {
        if (!cancelled) setOptIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    const prev = optIn;
    setOptIn(next);
    try {
      const res = await fetch("/api/affiliates/leaderboard-optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Could not save your choice.");
      }
      const d = await res.json();
      setOptIn(d.optIn === true);
    } catch (err) {
      setOptIn(prev);
      setError(err instanceof Error ? err.message : "Could not save your choice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-slate-900">Public leaderboard</h2>
          <p className="mt-1 text-sm text-slate-600">
            We run a public{" "}
            <a
              href="/leaderboard"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#c2410c] underline underline-offset-2 hover:text-[#9a3412]"
            >
              Top Affiliates board
            </a>
            . Off by default you appear only as your initials. Turn this on to be
            shown by your handle when you make the top ranks. Your referral count
            is the only number shown, never earnings or contact details.
          </p>
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={optIn === true}
          aria-label="Show my handle on the public leaderboard"
          disabled={optIn === null || saving}
          onClick={() => toggle(!optIn)}
          className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition disabled:opacity-50 ${
            optIn ? "bg-[#f97316]" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              optIn ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
