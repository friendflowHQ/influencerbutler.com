"use client";

import { useMemo, useState } from "react";
import { LINK_BUILDER_CHANNELS, type ChannelSlug } from "@/lib/affiliate-clicks";

// Medium each channel maps to for utm_medium.
function mediumFor(channel: ChannelSlug): string {
  if (channel === "email") return "email";
  if (channel === "blog") return "referral";
  return "social";
}

function slugifyCampaign(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function LinkBuilderClient() {
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState<ChannelSlug>("instagram");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);

  const result = useMemo<{ link: string | null; error: string | null }>(() => {
    const trimmed = url.trim();
    if (!trimmed) return { link: null, error: null };
    let parsed: URL;
    try {
      parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
      return { link: null, error: "That does not look like a valid link. Include the full URL." };
    }
    parsed.searchParams.set("utm_source", channel);
    parsed.searchParams.set("utm_medium", mediumFor(channel));
    const camp = slugifyCampaign(campaign);
    if (camp) parsed.searchParams.set("utm_campaign", camp);
    return { link: parsed.toString(), error: null };
  }, [url, channel, campaign]);

  async function copy() {
    if (!result.link) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-6 p-8">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="url">
            Your link (Amazon storefront, product, or any URL)
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://www.amazon.com/shop/yourname"
            onChange={(e) => setUrl(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-[#f97316]"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Where are you sharing it?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {LINK_BUILDER_CHANNELS.map((c) => {
              const active = c.slug === channel;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setChannel(c.slug)}
                  aria-pressed={active}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#f97316] text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-[#f97316] hover:text-[#f97316]"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="campaign">
            Campaign name (optional)
          </label>
          <input
            id="campaign"
            type="text"
            value={campaign}
            placeholder="e.g. spring-haul"
            onChange={(e) => setCampaign(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-[#f97316]"
          />
          <p className="mt-1 text-xs text-slate-500">
            Tag a specific post or promo so you can tell which one drove the clicks.
          </p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your tagged link
            </p>
            <button
              type="button"
              onClick={copy}
              disabled={!result.link}
              className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 break-all rounded-xl border border-orange-100 bg-white px-4 py-3 text-sm text-slate-700">
            {result.error ? (
              <span className="text-red-600">{result.error}</span>
            ) : result.link ? (
              result.link
            ) : (
              <span className="text-slate-400">Paste a link above to build your tagged version.</span>
            )}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            This adds standard UTM tags so your own analytics (and Amazon&apos;s storefront insights)
            can show which channel each click came from. It tags your links, separate from the
            Influencer Butler referral program.
          </p>
        </div>
      </div>
    </div>
  );
}
