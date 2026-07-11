"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AffiliateApplyInline from "./AffiliateApplyInline";
import SelfHostedAffiliateDashboard from "./SelfHostedAffiliateDashboard";
import PlannerCallout from "./PlannerCallout";
import { createClient } from "@/lib/supabase/client";

/**
 * Self-hosted affiliate program: there is no Lemon Squeezy portal step anymore.
 * The moment an application is approved (is_affiliate = true) the affiliate is
 * fully live - they get their code + tracked link immediately and complete the
 * tax form + PayPal details from the dashboard when they're ready to be paid.
 *
 * States: none (apply) -> pending (applied, under review) -> active (live).
 */
type MeState =
  | { state: "none" }
  | { state: "pending"; application: ApplicationRow | null }
  | { state: "active"; displayName: string };

type ProfileRow = {
  is_affiliate?: boolean | null;
  affiliate_code?: string | null;
};

type ApplicationRow = {
  status?: string;
  full_name?: string;
  email?: string;
  created_at?: string;
};

export default function AffiliatesPage() {
  const [data, setData] = useState<MeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();

        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          if (!cancelled) setLoadError("Please sign in to view affiliates.");
          return;
        }

        // Match the application on user_id OR email - a recreated account may
        // have an application row whose user_id no longer matches auth.uid()
        // but the email still does. RLS covers both.
        const userEmail = (user.email ?? "").toLowerCase();
        const [profileResult, applicationResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("is_affiliate,affiliate_code")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("affiliate_applications")
            .select("status,full_name,email,created_at")
            .or(userEmail ? `user_id.eq.${user.id},email.eq.${userEmail}` : `user_id.eq.${user.id}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const profile = (profileResult.data ?? null) as ProfileRow | null;
        const application = (applicationResult.data ?? null) as ApplicationRow | null;

        if (cancelled) return;

        if (profile?.is_affiliate === true) {
          const displayName = application?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there";
          setData({ state: "active", displayName });
        } else if (application) {
          setData({ state: "pending", application });
        } else {
          setData({ state: "none" });
        }
      } catch (err) {
        console.error("affiliates page load failed", err);
        if (!cancelled) setLoadError("Network error. Please refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (loadError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Affiliates</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          {loadError ?? "We couldn't load your affiliate data."}
        </div>
      </div>
    );
  }

  if (data.state === "none") {
    return <AffiliateApplyInline />;
  }

  if (data.state === "pending") {
    return (
      <PendingState
        submittedAt={data.application?.created_at ?? null}
        displayName={data.application?.full_name ?? null}
      />
    );
  }

  return <SelfHostedAffiliateDashboard displayName={data.displayName} />;
}

function PendingState({
  submittedAt,
  displayName,
}: {
  submittedAt: string | null;
  displayName: string | null;
}) {
  const pretty = submittedAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(submittedAt))
    : "recently";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate program
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {displayName ? `Thanks, ${displayName}.` : "Thanks for applying."}
        </h1>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Application pending
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Your application is under review</h2>
        <p className="mt-2 text-sm text-slate-600">
          Submitted {pretty}. We review your audience fit and promotion plan, then email you a
          decision (usually within a day or two). The moment we approve you, your branded code and
          tracked link appear right here: no second signup anywhere else.
        </p>

        <ol className="mt-8 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">1.</span>
            <span>We review your audience fit and promotion plan, then email you a decision.</span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">2.</span>
            <span>
              Once approved, your referral link and real-time stats unlock here instantly. Add your
              tax form and PayPal email whenever you&apos;re ready to be paid.
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">3.</span>
            <span>Share your link and start earning 30% every month, for the first 12 months of each referred subscription.</span>
          </li>
        </ol>
      </section>

      <PlannerCallout waiting />

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Questions? Email{" "}
        <Link
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-[#f97316] hover:text-[#ea580c]"
        >
          hello@influencerbutler.com
        </Link>
        .
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
