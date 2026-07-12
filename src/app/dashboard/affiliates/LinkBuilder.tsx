"use client";

import { useState } from "react";
import { LINK_BUILDER_CHANNELS, type ChannelSlug } from "@/lib/affiliate-clicks";

type Props = {
  /** The affiliate's branded code (e.g. "LIZ"). */
  code: string;
};

function buildLink(code: string, slug: ChannelSlug): string {
  // Public pricing page (not the auth-gated dashboard) so logged-out prospects
  // land on a live page. /pricing reads ?code= (prefill + attribution) and ?s=
  // (channel) for the click analytics breakdown.
  return `https://www.influencerbutler.com/pricing?code=${encodeURIComponent(
    code,
  )}&s=${slug}`;
}

export default function LinkBuilder({ code }: Props) {
  const [copiedSlug, setCopiedSlug] = useState<ChannelSlug | null>(null);

  const copy = async (slug: ChannelSlug) => {
    try {
      await navigator.clipboard.writeText(buildLink(code, slug));
      setCopiedSlug(slug);
      window.setTimeout(() => {
        setCopiedSlug((current) => (current === slug ? null : current));
      }, 1500);
    } catch (err) {
      console.error("LinkBuilder copy failed", err);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Per-channel share links (optional)
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Tap a channel to copy a tagged variant. Your dashboard breaks down clicks by the channel
            you used. The plain link above still works - we infer the source automatically when we can.
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {LINK_BUILDER_CHANNELS.map((channel) => {
          const isCopied = copiedSlug === channel.slug;
          return (
            <li key={channel.slug}>
              <button
                type="button"
                onClick={() => copy(channel.slug)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  isCopied
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-800 hover:border-[#f97316] hover:text-[#ea580c]"
                }`}
                aria-label={`Copy ${channel.label} share link`}
              >
                <span>{channel.label}</span>
                <span className="text-xs text-slate-500">
                  {isCopied ? "Copied!" : "Copy"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
