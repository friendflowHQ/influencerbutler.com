"use client";

import { useRef, useState } from "react";
import { trackEvent, trackFunnel } from "@/lib/analytics-client";

/**
 * Email-gated installer download for the /downloading interstitial.
 *
 * The free-app download used to auto-start and only ask (never require) for an
 * email, so most downloaders vanished un-nurtured. This gates the installer
 * behind a valid email: submitting it records the lead (email_subscribers
 * source = 'download-app', which feeds the day0/2/5/10 onboarding drip via the
 * affiliate-funnel cron) and THEN starts the download.
 *
 * Resilience: if the subscribe call errors (outage), we surface the error copy
 * but still unlock the manual link and start the download, so a genuine visitor
 * is never fully trapped behind a backend blip. By design, a visitor who never
 * submits an email does not get the installer.
 */
export default function GatedDownload({ url }: { url: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "unlocked" | "error">("idle");
  const [message, setMessage] = useState("");
  const downloaded = useRef(false);

  // Derive OS from the artifact URL for funnel attribution (mirrors the old
  // DownloadStarter logic).
  function osFromUrl(): string {
    return /\.exe(\?|$)/i.test(url)
      ? "win"
      : /arm64\.dmg/i.test(url)
        ? "mac-arm"
        : /\.dmg/i.test(url)
          ? "mac-intel"
          : "unknown";
  }

  // Starts the installer with a synthetic anchor click (not window.location) so
  // the browser treats the .exe/.dmg as an attachment and keeps this page
  // visible: this page is what pushes the free Chrome extension next.
  function triggerDownload() {
    if (downloaded.current) return;
    downloaded.current = true;
    const os = osFromUrl();
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    trackEvent("installer_download_started", { os });
    trackFunnel("installer-downloaded", { os });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email to start your download.");
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
      trackEvent("download_email_captured", {});
      setStatus("unlocked");
      triggerDownload();
    } catch {
      // Never trap a real visitor behind a backend blip: unlock and download
      // anyway, but keep the error visible so they know the guide may not send.
      setStatus("error");
      setMessage(
        "We could not save your email just now, but your download is starting. You can try the guide again later.",
      );
      triggerDownload();
    }
  }

  if (status === "unlocked") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          You are set. Your {osFromUrl() === "win" ? "Windows" : "Mac"} download is starting, and
          your 3-minute setup guide is on its way to your inbox.
        </div>
        <p className="text-sm text-slate-500">
          Download not starting?{" "}
          <a href={url} className="font-semibold text-[#f97316] underline hover:text-[#ea580c]">
            Click here to download it manually
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-xl bg-orange-50/70 p-4">
      <label htmlFor="download-email" className="block text-sm font-semibold text-slate-800">
        Enter your email to start the download
      </label>
      <p className="mt-1 text-xs text-slate-500">
        We will email your 3-minute setup guide and the fastest ways to earn with the free butlers.
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
          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-[#f97316] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60"
        >
          {status === "sending" ? "Starting..." : "Start my download"}
        </button>
      </div>
      {status === "error" && message ? (
        <p className="mt-2 text-xs text-red-600">{message}</p>
      ) : null}
    </form>
  );
}
