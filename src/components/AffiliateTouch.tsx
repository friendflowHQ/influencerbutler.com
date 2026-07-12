"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Fires first-touch affiliate attribution from a ?code= URL param on any page it
 * is mounted on. Persists the ib_aff_src cookie (via /api/promo/touch) so the
 * affiliate is still credited when the visitor later checks out, and logs a
 * click row for the per-source analytics dashboard.
 *
 * The subscription and pricing pages have their own inline copies of this
 * because they also need the code for the promo input / checkout body. This
 * component exists for pages that only need to record the touch (e.g. the free
 * extension landing page, where an affiliate drives a no-friction install).
 *
 * Renders nothing. Must be wrapped in <Suspense> when mounted inside a server
 * component page, because useSearchParams opts the subtree into client render.
 */
export default function AffiliateTouch() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const fromQuery = searchParams.get("code");
    if (!fromQuery || fromQuery.trim().length === 0) return;

    const normalized = fromQuery.trim().toUpperCase();
    const sourceParam = searchParams.get("s");
    const referrer = typeof document !== "undefined" ? document.referrer : "";

    fetch("/api/promo/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliateSource: normalized,
        source: sourceParam ?? undefined,
        referrer: referrer || undefined,
      }),
    }).catch(() => {
      // Non-fatal: attribution is best-effort. A later checkout can still
      // fall back to the code typed at checkout.
    });
  }, [searchParams]);

  return null;
}
