"use client";

import { useEffect, useState } from "react";
import {
  REASONS,
  WOULD_RETURN_OPTIONS,
  type Reason,
  type WouldReturn,
} from "@/lib/cancel-reasons-shared";

type LoadState = "checking" | "ready" | "done" | "invalid";

export default function CancelSurveyForm({ token }: { token: string }) {
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [reason, setReason] = useState<Reason | null>(null);
  const [intendedOutcome, setIntendedOutcome] = useState("");
  const [wouldReturn, setWouldReturn] = useState<WouldReturn | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadState("invalid");
      return;
    }
    let cancelled = false;
    fetch(`/api/cancel-survey?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; completed?: boolean };
        if (cancelled) return;
        if (!res.ok || !json.ok) setLoadState("invalid");
        else if (json.completed) setLoadState("done");
        else setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cancel-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reason: reason ?? "other",
          intendedOutcome: intendedOutcome.trim() || null,
          wouldReturn: wouldReturn ?? null,
          feedback: feedback.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save your answer");
      setLoadState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer");
    } finally {
      setSubmitting(false);
    }
  };

  const card = "mx-auto mt-16 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8";

  if (loadState === "checking") {
    return <div className={card}><p className="text-slate-500">Loading...</p></div>;
  }

  if (loadState === "invalid") {
    return (
      <div className={card}>
        <h1 className="text-lg font-semibold text-slate-900">This link is not valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          The survey link may have expired or already been used. No action is needed.
        </p>
      </div>
    );
  }

  if (loadState === "done") {
    return (
      <div className={card}>
        <h1 className="text-lg font-semibold text-slate-900">Thank you</h1>
        <p className="mt-2 text-sm text-slate-600">
          We really appreciate you taking the time. Your feedback helps us improve Influencer
          Butler for everyone.
        </p>
      </div>
    );
  }

  return (
    <div className={card}>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        Why did you cancel?
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        One quick question, plus anything else you&apos;d like to share. Thanks for helping us
        improve.
      </p>

      <fieldset className="mt-5 space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Main reason
        </legend>
        {REASONS.map((r) => (
          <label
            key={r.value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
              reason === r.value
                ? "border-[#f97316] bg-[#f97316]/5"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="cancel-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="h-4 w-4 accent-[#f97316]"
            />
            <span className="text-slate-700">{r.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          What were you hoping to accomplish? (optional)
        </label>
        <textarea
          value={intendedOutcome}
          onChange={(e) => setIntendedOutcome(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder="e.g. land brand deals, automate outreach, harvest commissions..."
        />
      </div>

      <div className="mt-4">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          How likely are you to come back? (optional)
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {WOULD_RETURN_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                wouldReturn === o.value
                  ? "border-[#f97316] bg-[#f97316]/5"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="would-return"
                value={o.value}
                checked={wouldReturn === o.value}
                onChange={() => setWouldReturn(o.value)}
                className="h-4 w-4 accent-[#f97316]"
              />
              <span className="text-slate-700">{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Anything else you&apos;d like us to know? (optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder="Share a quick note - this helps us improve."
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !reason}
          className="rounded-lg bg-[#f97316] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send feedback"}
        </button>
      </div>
    </div>
  );
}
