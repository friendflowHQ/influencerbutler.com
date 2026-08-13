"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics-client";

type ReferralData = {
  enabled: boolean;
  link?: string | null;
  friendsJoined?: number;
  rewardsEarned?: number;
};

/**
 * "Invite a friend" card. Self-hides unless the referral program is on and the
 * user has an invite link. Copy points to the two-sided reward: the friend gets
 * a free month, and the referrer earns a free month when the friend goes Pro.
 */
export default function ReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/referrals/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as ReferralData;
        if (alive) setData(json);
      } catch (error) {
        console.error("ReferralCard fetch failed", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!data || !data.enabled || !data.link) return null;

  const link = data.link;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      trackEvent("referral_link_copied", {});
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore - the link is selectable in the field as a fallback
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-violet-900">
        Give a friend a free month, get a free month
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Share your link. Your friend gets a free month of Pro when they join, and you get a free
        month of Pro when they become a paying customer.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-sm focus:border-violet-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-4 flex gap-6 text-sm">
        <div>
          <span className="text-xl font-bold text-slate-900">{data.friendsJoined ?? 0}</span>{" "}
          <span className="text-slate-500">friends joined</span>
        </div>
        <div>
          <span className="text-xl font-bold text-slate-900">{data.rewardsEarned ?? 0}</span>{" "}
          <span className="text-slate-500">free months earned</span>
        </div>
      </div>
    </section>
  );
}
