"use client";

import { useEffect, useState } from "react";

type LoadState = "checking" | "ready" | "done" | "invalid";

const RATINGS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

export default function ExtensionFeedbackForm({ email, token }: { email: string; token: string }) {
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [rating, setRating] = useState<number | null>(null);
  const [use, setUse] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [percent, setPercent] = useState<number>(99);
  const [copied, setCopied] = useState(false);

  const query = `e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!email || !token) {
      setLoadState("invalid");
      return;
    }
    let cancelled = false;
    fetch(`/api/extension/review/feedback?${query}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          completed?: boolean;
          code?: string | null;
          percent?: number;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setLoadState("invalid");
          return;
        }
        if (typeof json.percent === "number") setPercent(json.percent);
        if (json.completed) {
          setCode(json.code ?? null);
          setLoadState("done");
        } else {
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("invalid");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, token]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/extension/review/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          e: email,
          t: token,
          rating,
          use: use.trim() || null,
          feedback: feedback.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; code?: string | null; percent?: number };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save your answer");
      if (typeof json.percent === "number") setPercent(json.percent);
      setCode(json.code ?? null);
      setLoadState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is still visible to copy by hand.
    }
  };

  const card =
    "mx-auto mt-16 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8";

  if (loadState === "checking") {
    return (
      <div className={card}>
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (loadState === "invalid") {
    return (
      <div className={card}>
        <h1 className="text-lg font-semibold text-slate-900">This link is not valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          The feedback link may have expired or been mistyped. If you installed the Influencer
          Butler extension and want the offer, reply to any of our emails and we will sort it out.
        </p>
      </div>
    );
  }

  if (loadState === "done") {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Thank you!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your feedback goes straight to our team. As promised, here is {percent} percent off your
          first month of Pro:
        </p>
        {code ? (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-center text-lg font-bold tracking-widest text-slate-900">
                {code}
              </code>
              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <a
              href={`/dashboard/subscription?code=${encodeURIComponent(code)}`}
              className="mt-4 block rounded-lg bg-[#f97316] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#ea580c]"
            >
              Use this code
            </a>
            <p className="mt-3 text-xs text-slate-500">
              Applies to your first month of Pro. The code is single-use and expires in 30 days.
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your discount code is on its way by email. If it does not arrive within a few minutes,
            just reply and we will send it over.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={card}>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        60 seconds of feedback, {percent}% off your first month
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Tell us how the Influencer Butler extension is working for you. Honest answers only, good or
        bad. As a thank-you for filling this out, you will get {percent} percent off your first
        month of Pro.
      </p>

      <div className="mt-5">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          How useful is the extension so far?
        </span>
        <div className="mt-2 flex gap-2">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRating(r.value)}
              className={`h-11 flex-1 rounded-lg border text-sm font-semibold transition ${
                rating === r.value
                  ? "border-[#f97316] bg-[#f97316]/10 text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>Not useful</span>
          <span>Very useful</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          What do you mainly use it for? (optional)
        </label>
        <textarea
          value={use}
          onChange={(e) => setUse(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder="e.g. checking money signals on product pages, finding content gaps..."
        />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Anything we could do better? (optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder="A missing feature, a bug, anything. This is the most useful part for us."
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
          disabled={submitting || rating === null}
          className="rounded-lg bg-[#f97316] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send feedback and get my code"}
        </button>
      </div>
    </div>
  );
}
