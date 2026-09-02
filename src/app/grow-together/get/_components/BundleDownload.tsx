"use client";

import { useRef, useState } from "react";
import { BUNDLE_PDF_PATH, READER_SOURCE } from "../../_data/bundleMeta";

/**
 * Email-gated download for the finished Grow Together Creator Bundle PDF. Mirrors
 * src/app/downloading/GatedDownload.tsx: capture the email, record the lead
 * (email_subscribers source = the reader source, which auto-enrolls the reader
 * nurture drip via the source trigger), then reveal + start the PDF download.
 *
 * IMPORTANT: this form carries the co-registration disclosure. Everyone who
 * downloads is told plainly that their email is shared with the contributing
 * creators, which is the payoff that made those creators promote the bundle. Do
 * not remove or soften that line without changing the sharing model.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BundleDownload() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "unlocked" | "error">("idle");
  const [message, setMessage] = useState("");
  const downloaded = useRef(false);

  function triggerDownload() {
    if (downloaded.current) return;
    downloaded.current = true;
    const a = document.createElement("a");
    a.href = BUNDLE_PDF_PATH;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email to get your copy.");
      return;
    }
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: READER_SOURCE }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("unlocked");
      triggerDownload();
    } catch {
      // Never trap a real visitor behind a backend blip: unlock and download
      // anyway, but keep the error visible.
      setStatus("error");
      setMessage("We could not save your email just now, but your download is starting.");
      triggerDownload();
    }
  }

  if (status === "unlocked") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <h3 className="text-lg font-bold text-green-900">Your bundle is downloading.</h3>
        <p className="mt-2 text-sm text-green-800">
          Not starting?{" "}
          <a href={BUNDLE_PDF_PATH} className="font-semibold text-orange-700 underline hover:text-orange-800">
            Click here to download it manually
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <label htmlFor="bundle-email" className="block text-base font-semibold text-slate-900">
        Enter your email to get the free bundle
      </label>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="bundle-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : "Send me the bundle"}
        </button>
      </div>
      {status === "error" && message ? <p className="mt-2 text-xs text-red-600">{message}</p> : null}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Heads up: this bundle was written by a group of creators. By downloading, your email is shared
        with the contributing creators so they can send you their content and offers. You can
        unsubscribe from any of them at any time. We never sell your information.
      </p>
    </form>
  );
}
