"use client";

import { useMemo, useState } from "react";
import { LINK_BUILDER_CHANNELS, type ChannelSlug } from "@/lib/affiliate-clicks";

// Medium each channel maps to for utm_medium.
function mediumFor(channel: ChannelSlug): string {
  if (channel === "email") return "email";
  if (channel === "blog") return "referral";
  return "social";
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Best-effort branded slug for the DeepLink preview: prefer the campaign, else
// the last path segment of the URL, else a friendly placeholder.
function brandedSlug(campaign: string, parsed: URL | null): string {
  const fromCampaign = slugify(campaign);
  if (fromCampaign) return fromCampaign;
  if (parsed) {
    const seg = parsed.pathname.split("/").filter(Boolean).pop();
    if (seg) {
      const s = slugify(seg);
      if (s) return s;
    }
  }
  return "your-link";
}

type Provider = "utm" | "deeplink";

export default function LinkBuilderClient() {
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState<ChannelSlug>("instagram");
  const [campaign, setCampaign] = useState("");
  const [provider, setProvider] = useState<Provider>("utm");
  const [copied, setCopied] = useState(false);

  const { link, parsed, error } = useMemo<{
    link: string | null;
    parsed: URL | null;
    error: string | null;
  }>(() => {
    const trimmed = url.trim();
    if (!trimmed) return { link: null, parsed: null, error: null };
    let p: URL;
    try {
      p = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
      return { link: null, parsed: null, error: "That does not look like a valid link. Include the full URL." };
    }
    p.searchParams.set("utm_source", channel);
    p.searchParams.set("utm_medium", mediumFor(channel));
    const camp = slugify(campaign);
    if (camp) p.searchParams.set("utm_campaign", camp);
    return { link: p.toString(), parsed: p, error: null };
  }, [url, channel, campaign]);

  const deeplinkPreview = `links.influencerbutler.com/${brandedSlug(campaign, parsed)}`;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
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

        {/* Link type toggle */}
        <div>
          <span className="block text-sm font-medium text-slate-700">Link type</span>
          <div
            className="mt-2 inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label="Link type"
          >
            {([
              { key: "utm", label: "UTM tags" },
              { key: "deeplink", label: "Influencer Butler DeepLink" },
            ] as const).map((opt) => {
              const active = provider === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setProvider(opt.key)}
                  aria-pressed={active}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#f97316] text-white shadow-sm"
                      : "text-slate-600 hover:text-[#f97316]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {provider === "utm" ? (
          <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Your tagged link
              </p>
              <button
                type="button"
                onClick={copy}
                disabled={!link}
                className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <div className="mt-3 break-all rounded-xl border border-orange-100 bg-white px-4 py-3 text-sm text-slate-700">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : link ? (
                link
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
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Branded DeepLink
              </p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[#f97316]">
                Sample
              </span>
            </div>
            <div className="mt-3 break-all rounded-xl border border-orange-100 bg-white px-4 py-3 text-lg font-semibold text-slate-900">
              {deeplinkPreview}
            </div>
            {error ? (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            ) : link ? (
              <p className="mt-2 break-all text-xs text-slate-500">Points to: {link}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Paste a link above to preview its branded DeepLink.</p>
            )}
            <p className="mt-4 text-sm text-slate-600">
              Pick <strong>Influencer Butler</strong> as your provider under DeepLink Routing and every
              link your tools build becomes a short, branded <strong>links.influencerbutler.com</strong>{" "}
              link you own, with a Link Performance dashboard showing real clicks by day, country, and
              device. Your affiliate tag is preserved. It is free on every plan, including Free forever.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href="/go/download?src=tool-affiliate-link-builder-deeplink"
                className="rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
              >
                Get branded DeepLinks free →
              </a>
              <a
                href="/features/influencer-butler-deeplinks"
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-[#f97316] hover:text-[#f97316]"
              >
                How DeepLinks work
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              The sample above shows the format. Your real branded links are generated automatically
              inside the Influencer Butler app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
