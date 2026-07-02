"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Surfaces the user's unredeemed personal discount codes (minted during the
 * trial funnel) so they don't go to waste. Self-fetching; renders nothing when
 * there is no live code. "Use this code" routes to the subscription page,
 * which already prefills the promo input from ?code=.
 */

type UserCode = {
  code: string;
  plan: "monthly" | "annual";
  percent: number | null;
  expiresAt: string | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function DiscountCodesCard() {
  const router = useRouter();
  const pathname = usePathname();
  const [codes, setCodes] = useState<UserCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me/discount-codes", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { codes?: UserCode[] };
        if (alive) setCodes(json.codes ?? []);
      } catch {
        // best-effort: no card on failure
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (codes.length === 0) return null;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      // clipboard unavailable: user can select the text manually
    }
  };

  const useCode = (code: string) => {
    const target = `/dashboard/subscription?code=${encodeURIComponent(code)}`;
    if (pathname === "/dashboard/subscription") {
      // Already on the page: replace so the promo input picks up the code.
      window.location.href = target;
    } else {
      router.push(target);
    }
  };

  return (
    <article className="rounded-xl border border-orange-200 bg-orange-50 p-4 sm:p-5 shadow-sm">
      <h2 className="text-sm font-medium uppercase tracking-wide text-orange-700">
        Your personal discount {codes.length === 1 ? "code" : "codes"}
      </h2>
      <div className="mt-3 space-y-3">
        {codes.map((c) => {
          const expires = formatDate(c.expiresAt);
          return (
            <div
              key={c.code}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-white p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-900">
                    {c.code}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy(c.code)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    {copied === c.code ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {c.percent !== null ? `${c.percent}% off ` : "Discount "}
                  {c.plan === "annual" ? "the annual plan" : "your first month"}
                  {expires ? ` - expires ${expires}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => useCode(c.code)}
                className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c]"
              >
                Use this code
              </button>
            </div>
          );
        })}
      </div>
    </article>
  );
}
