"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  /** Poll interval in ms. */
  intervalMs?: number;
};

/**
 * Shown by the /welcome dispatcher when a guest-checkout user lands back from
 * Lemon Squeezy without an authenticated session (expected — their account is
 * created by the order_created webhook which also emails them a magic link).
 *
 * This page:
 *   1. Confirms payment received
 *   2. Tells them to check their inbox for the sign-in link
 *   3. Polls Supabase for a session every 2s — the moment their magic link
 *      lands them back here authed, the server component will dispatch to the
 *      correct tier page.
 */
export default function WelcomeCheckInboxClient({ intervalMs = 2000 }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createClient();

    const tick = async (secondsSoFar: number) => {
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          window.location.reload();
          return;
        }
      } catch {
        // swallow transient errors and keep polling
      }
      const next = secondsSoFar + intervalMs / 1000;
      setElapsed(next);
      timer = setTimeout(() => tick(next), intervalMs);
    };

    timer = setTimeout(() => tick(0), intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
        <svg
          className="h-6 w-6 text-emerald-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
        Payment received — check your inbox
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
        We just emailed you a secure sign-in link. Click it to finish setup and
        download the desktop app.
      </p>
      <p className="mt-4 text-xs text-slate-400">
        Don&apos;t see it? Check spam, or wait a moment — it arrives within seconds.
      </p>
      <p className="mt-2 text-xs text-slate-400">{Math.round(elapsed)}s elapsed</p>
    </section>
  );
}
