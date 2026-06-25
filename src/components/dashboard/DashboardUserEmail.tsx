"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Renders a small pill in the dashboard header showing the email of the
 * signed-in account. Loaded client-side via supabase.auth.getUser() (same
 * pattern as the Sidebar) because server-side Supabase calls fail on Vercel
 * due to DNS resolution issues. Renders nothing until the email resolves, so
 * there is no flash of an empty placeholder.
 */
export default function DashboardUserEmail() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadEmail = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const value = data.user?.email ?? null;
        if (!cancelled && value) setEmail(value);
      } catch {
        // ignore - the pill just won't show
      }
    };
    void loadEmail();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!email) return null;

  return (
    <span
      title={email}
      className="ml-auto inline-flex max-w-[60vw] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm sm:max-w-xs"
    >
      <svg
        className="h-3.5 w-3.5 flex-none text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9"
        />
      </svg>
      <span className="truncate">{email}</span>
    </span>
  );
}
