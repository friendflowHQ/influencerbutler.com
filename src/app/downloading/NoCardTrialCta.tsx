"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics-client";

/**
 * "Try Pro free for 14 days, no card" on the download interstitial. Posts to
 * /api/trial/no-card, which mints an in-house Pro comp and emails the license
 * key. Only rendered when NO_CARD_TRIAL_ENABLED is on (the page gates it), so
 * this component assumes the endpoint is live.
 */
export default function NoCardTrialCta() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email.");
      return;
    }
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/trial/no-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setStatus("done");
        trackEvent("no_card_trial_started", {});
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setMessage(data.error || "Something went wrong. Please try again in a moment.");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again in a moment.");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-sm text-emerald-900">
        <p className="font-semibold">Your 14-day Pro trial is on its way.</p>
        <p className="mt-1">
          Check your inbox for your license key, then paste it into the desktop app to unlock every
          Pro butler. No card, and nothing charges when the 14 days are up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-6">
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
        Optional
      </span>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
        Want the full Pro experience? Try it free for 14 days, no card.
      </h2>
      <p className="mt-2 text-sm text-slate-700">
        Unlock every Pro butler (Daily Commission, Deals, Messenger, and the rest) for 14 days. We
        email your license key instantly. No credit card, and nothing charges when the trial ends.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : "Start my free Pro trial"}
        </button>
      </div>
      {status === "error" && message ? (
        <p className="mt-2 text-xs text-red-600">{message}</p>
      ) : null}
    </form>
  );
}
