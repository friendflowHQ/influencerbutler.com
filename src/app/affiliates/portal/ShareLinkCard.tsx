"use client";

import { useState } from "react";

type ShareLinkCardProps = {
  shareLink: string;
  shareDomain: string | null;
};

export default function ShareLinkCard({ shareLink, shareDomain }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  return (
    <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">
            Your share link
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Every sign-up that comes through this link — within a 30-day cookie — is credited to you.
          </p>
        </div>
        {shareDomain ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
            {shareDomain}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          readOnly
          value={shareLink}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
