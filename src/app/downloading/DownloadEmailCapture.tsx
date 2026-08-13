"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics-client";

/**
 * Non-blocking email capture on the download interstitial.
 *
 * The free-app download itself never created an account or captured an email,
 * so ~1,100 downloaders a month used to vanish un-nurtured. This asks (never
 * requires) for an email so we can send the short setup + upgrade drip
 * (email_subscribers source = 'download-app', driven by the affiliate-funnel
 * cron's onboarding step). The installer download is already firing regardless,
 * so skipping this costs the visitor nothing.
 */
export default function DownloadEmailCapture() {
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
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "download-app" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("done");
      trackEvent("download_email_captured", {});
    } catch {
      setStatus("error");
      setMessage("Something went wrong. You can still install the app - try again in a moment.");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        You are set. Check your inbox for your 3-minute setup guide. Your download is still going in
        the background.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-xl bg-orange-50/70 p-4">
      <label htmlFor="download-email" className="block text-sm font-semibold text-slate-800">
        Want your 3-minute setup guide and pro tips?
      </label>
      <p className="mt-1 text-xs text-slate-500">
        Optional. We will email your setup steps and the fastest ways to earn with the free butlers.
        No spam, unsubscribe any time.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="download-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : "Send it to me"}
        </button>
      </div>
      {status === "error" && message ? (
        <p className="mt-2 text-xs text-red-600">{message}</p>
      ) : null}
    </form>
  );
}
