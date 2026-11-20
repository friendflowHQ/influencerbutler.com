"use client";

// Counts of things waiting on an admin decision, for the sidebar badges.
// Pulls from /api/admin/overview (affiliate applications, testimonials,
// community posts, extension feedback, webhook errors) and the support queue.
// Cached in sessionStorage for two minutes so moving between admin pages does
// not refetch every time. Best-effort: any failure just means no badges.

import { useEffect, useState } from "react";

export type AttentionCounts = Record<string, number>; // keyed by admin href

const CACHE_KEY = "ib-admin-attention-v1";
const TTL_MS = 2 * 60 * 1000;

type Overview = {
  pendingAffiliates?: number | null;
  pendingTestimonials?: number | null;
  pendingCommunity?: number | null;
  newExtensionFeedback?: number | null;
  webhookErrors24h?: number | null;
};

function readCache(): AttentionCounts | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; counts: AttentionCounts };
    return Date.now() - parsed.at < TTL_MS ? parsed.counts : null;
  } catch {
    return null;
  }
}

async function fetchCounts(): Promise<AttentionCounts> {
  const counts: AttentionCounts = {};
  const [overview, support] = await Promise.allSettled([
    fetch("/api/admin/overview", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Overview>) : null)),
    fetch("/api/admin/support/counts", { cache: "no-store" }).then((r) =>
      r.ok ? (r.json() as Promise<{ counts?: Record<string, number> }>) : null,
    ),
  ]);
  const o = overview.status === "fulfilled" ? overview.value : null;
  if (o) {
    const set = (href: string, n: number | null | undefined) => {
      if (typeof n === "number" && n > 0) counts[href] = n;
    };
    set("/dashboard/admin/affiliates", o.pendingAffiliates);
    set("/dashboard/admin/testimonials", o.pendingTestimonials);
    set("/dashboard/admin/community", o.pendingCommunity);
    set("/dashboard/admin/extension-feedback", o.newExtensionFeedback);
    set("/dashboard/admin/webhooks", o.webhookErrors24h);
  }
  const s = support.status === "fulfilled" ? support.value?.counts : null;
  if (s) {
    const open = (s.escalated ?? 0) + (s.user_replied ?? 0) + (s.sent ?? 0);
    if (open > 0) counts["/dashboard/admin/support"] = open;
  }
  return counts;
}

export function useAdminAttention(enabled: boolean): AttentionCounts {
  const [counts, setCounts] = useState<AttentionCounts>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cached = readCache();
    void (cached ? Promise.resolve(cached) : fetchCounts()).then((result) => {
      if (cancelled) return;
      setCounts(result);
      if (cached) return;
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), counts: result }));
      } catch {
        // storage blocked: badges just refetch next time
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return counts;
}
