"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Max seconds to poll before giving up and sending the user to /dashboard. */
  maxSeconds?: number;
  /** Poll interval in ms. */
  intervalMs?: number;
};

type SubscriptionResponse = {
  tierRoute: "/welcome/trial" | "/welcome/monthly" | "/welcome/annual" | null;
};

/**
 * Shown by the /welcome dispatcher when the Lemon Squeezy webhook hasn't
 * landed yet. Polls /api/me/subscription and redirects to the correct tier
 * page as soon as a subscription row exists.
 */
export default function WelcomePollClient({
  maxSeconds = 30,
  intervalMs = 2000,
}: Props) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (secondsSoFar: number) => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/me/subscription", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as SubscriptionResponse;
          if (data.tierRoute) {
            router.replace(data.tierRoute);
            return;
          }
        }
      } catch {
        // swallow transient errors and keep polling
      }
      const next = secondsSoFar + intervalMs / 1000;
      if (next >= maxSeconds) {
        router.replace("/dashboard");
        return;
      }
      setElapsed(next);
      timer = setTimeout(() => tick(next), intervalMs);
    };

    timer = setTimeout(() => tick(0), intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, intervalMs, maxSeconds]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#f97316]" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
        Finalizing your subscription…
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        This usually takes a few seconds. Hang tight — we&apos;re confirming everything with Lemon Squeezy.
      </p>
      <p className="mt-4 text-xs text-slate-400">{Math.round(elapsed)}s elapsed</p>
    </section>
  );
}
