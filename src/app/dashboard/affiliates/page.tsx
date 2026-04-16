"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AffiliateApplyInline from "./AffiliateApplyInline";
import AffiliateDashboard from "./AffiliateDashboard";
import type { AffiliateReferralStats, AffiliateSummary } from "@/lib/affiliates";
import { createClient } from "@/lib/supabase/client";

type MeResponse =
  | { state: "none"; application: null }
  | {
      state: "pending";
      application: { status?: string; full_name?: string; email?: string; created_at?: string } | null;
    }
  | {
      state: "ls-signup";
      brandedCode: string | null;
    }
  | {
      state: "active" | "disabled";
      affiliate: AffiliateSummary;
      referrals: AffiliateReferralStats | null;
      lsAffiliateId: string;
      brandedCode?: string | null;
    }
  | { state: "error"; message: string };

type ProfileRow = {
  is_affiliate?: boolean | null;
  ls_affiliate_id?: string | null;
  affiliate_code?: string | null;
};

type ApplicationRow = {
  status?: string;
  full_name?: string;
  email?: string;
  created_at?: string;
};

export default function AffiliatesPage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();

        // Step 1: Fetch auth user from the browser client (cookies, no network issues).
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          if (!cancelled) setLoadError("Please sign in to view affiliates.");
          return;
        }

        // Step 2: Fetch profile + application directly from Supabase (client-side works).
        // Match application on user_id OR email — a returning applicant whose
        // account was recreated (e.g. via email confirmation) may have an
        // application row whose user_id no longer matches auth.uid(), but the
        // email still does. RLS covers both cases.
        const userEmail = (user.email ?? "").toLowerCase();
        const [profileResult, applicationResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("is_affiliate,ls_affiliate_id,affiliate_code")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("affiliate_applications")
            .select("status,full_name,email,created_at")
            .or(
              userEmail
                ? `user_id.eq.${user.id},email.eq.${userEmail}`
                : `user_id.eq.${user.id}`,
            )
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const profile = (profileResult.data ?? null) as ProfileRow | null;
        const application = (applicationResult.data ?? null) as ApplicationRow | null;

        const lsAffiliateId =
          typeof profile?.ls_affiliate_id === "string" && profile.ls_affiliate_id.length > 0
            ? profile.ls_affiliate_id
            : null;

        // Step 3: No LS affiliate ID yet. Three sub-states:
        //   - Approved on our side but waiting for LS portal signup → "ls-signup"
        //   - Applied but not yet approved → "pending"
        //   - Never applied → "none"
        if (!lsAffiliateId) {
          if (!cancelled) {
            if (profile?.is_affiliate === true) {
              setData({
                state: "ls-signup",
                brandedCode:
                  typeof profile?.affiliate_code === "string" && profile.affiliate_code.length > 0
                    ? profile.affiliate_code
                    : null,
              });
            } else {
              setData({
                state: application ? "pending" : "none",
                application: application ?? null,
              } as MeResponse);
            }
          }
          return;
        }

        // Step 4: Fetch LS stats via server route (LS API key lives there).
        const res = await fetch("/api/affiliates/me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lsAffiliateId }),
          cache: "no-store",
        });

        if (!res.ok) {
          if (!cancelled) setLoadError(`Failed to load (${res.status})`);
          return;
        }

        const json = (await res.json()) as MeResponse;
        if (!cancelled) {
          // Merge the branded code from the profile query into the active/disabled state.
          if (json.state === "active" || json.state === "disabled") {
            const brandedCode =
              typeof profile?.affiliate_code === "string" && profile.affiliate_code.length > 0
                ? profile.affiliate_code
                : null;
            setData({ ...json, brandedCode });
          } else {
            setData(json);
          }
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

  if (data.state === "ls-signup") {
    return <LsSignupPending brandedCode={data.brandedCode} />;
  }

  if (data.state === "error") {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Affiliate dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Hi there.</h1>
        </header>
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
          We couldn&apos;t load your affiliate stats right now. Please try again in a minute — or reach
          out to{" "}
          <a
            href="mailto:hello@influencerbutler.com"
            className="font-medium underline underline-offset-2"
          >
            hello@influencerbutler.com
          </a>{" "}
          if the issue persists.
        </section>
      </div>
    );
  }

  // active | disabled
  return (
    <AffiliateDashboard
      summary={data.affiliate}
      referrals={data.referrals}
      lsAffiliateId={data.lsAffiliateId}
      displayName={data.affiliate.userEmail ?? "there"}
      brandedCode={data.brandedCode ?? null}
    />
  );
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
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {displayName ? `Thanks, ${displayName}.` : "Thanks for applying."}
        </h1>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Application pending
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Your application is under review</h2>
        <p className="mt-2 text-sm text-slate-600">
          Submitted {pretty}. Our team reviews new affiliates weekly — you&apos;ll hear back via email,
          usually within 48 hours. Once approved, this page will automatically switch to your
          affiliate dashboard.
        </p>

        <ol className="mt-8 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">1.</span>
            <span>We review your audience fit and promotion plan.</span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">2.</span>
            <span>
              Once approved, your unique referral link and real-time stats show up here automatically.
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">3.</span>
            <span>Share your link and start earning 35% every month — forever.</span>
          </li>
        </ol>
      </section>

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

function LsSignupPending({ brandedCode }: { brandedCode: string | null }) {
  const [copied, setCopied] = useState(false);
  const signupUrl = process.env.NEXT_PUBLIC_LEMONSQUEEZY_AFFILIATE_SIGNUP_URL ?? "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  const brandedShareLink = brandedCode
    ? `https://www.influencerbutler.com/dashboard/subscription?code=${encodeURIComponent(brandedCode)}`
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate program
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          You&apos;re in — one last step.
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Activate your tracked referral link by completing a 30-second signup on Lemon Squeezy.
          Once they confirm you, your full affiliate dashboard unlocks automatically.
        </p>
      </header>

      <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">
          Step 1 — Finalize on Lemon Squeezy
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Sign up using the <strong>same email</strong> you used to apply here, so we can match your
          account. You&apos;ll come right back.
        </p>
        {signupUrl ? (
          <a
            href={signupUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
          >
            Complete signup on Lemon Squeezy →
          </a>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Signup URL not configured. Reach out to{" "}
            <a
              href="mailto:hello@influencerbutler.com"
              className="font-medium underline underline-offset-2"
            >
              hello@influencerbutler.com
            </a>{" "}
            to get your tracked link activated.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Your tracked link will appear here automatically once Lemon Squeezy confirms you. Just
          refresh this page after completing signup.
        </p>
      </section>

      {brandedCode ? (
        <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Step 2 — Start promoting today
          </p>
          <p className="mt-2 text-sm text-slate-700">
            You can share your branded <strong>15%-off code</strong> right now — no waiting. When
            customers use it, you earn 35% recurring commission.
          </p>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-indigo-300 bg-white px-4 py-3">
            <span className="font-mono text-xl font-bold tracking-widest text-indigo-900">
              {brandedCode}
            </span>
            <button
              type="button"
              onClick={() => copy(brandedCode)}
              className="ml-auto text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              {copied ? "Copied!" : "Copy code"}
            </button>
          </div>

          {brandedShareLink ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pre-filled share link
              </p>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  readOnly
                  value={brandedShareLink}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => copy(brandedShareLink)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Copy link
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

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
