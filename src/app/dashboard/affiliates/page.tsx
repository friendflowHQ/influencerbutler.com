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
      userEmail: string | null;
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
        // Match application on user_id OR email - a returning applicant whose
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
                userEmail: user.email ?? null,
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
    return <LsSignupPending brandedCode={data.brandedCode} userEmail={data.userEmail} />;
  }

  if (data.state === "error") {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Affiliate dashboard
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Hi there.</h1>
        </header>
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-6 text-sm text-amber-800 shadow-sm">
          We couldn&apos;t load your affiliate stats right now. Please try again in a minute - or reach
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
          Submitted {pretty}. Our team reviews new affiliates weekly - you&apos;ll hear back via email,
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
            <span>Share your link and start earning 30% every month - for the first 12 months of each referred subscription.</span>
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

function LsSignupPending({
  brandedCode: _brandedCode,
  userEmail,
}: {
  brandedCode: string | null;
  userEmail: string | null;
}) {
  const signupUrl = process.env.NEXT_PUBLIC_LEMONSQUEEZY_AFFILIATE_SIGNUP_URL ?? "";
  const [checkState, setCheckState] = useState<
    "idle" | "checking" | "found" | "not_found" | "error"
  >("idle");
  const [checkError, setCheckError] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    if (checkState === "checking") return;
    setCheckState("checking");
    setCheckError(null);
    try {
      const res = await fetch("/api/affiliates/check-ls-status", {
        method: "POST",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        found?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setCheckState("error");
        setCheckError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      if (json.found) {
        setCheckState("found");
        window.location.reload();
        return;
      }
      setCheckState("not_found");
      // Re-enable the button after a short cooldown so they can try again.
      window.setTimeout(() => setCheckState("idle"), 10000);
    } catch (err) {
      console.error("check-ls-status request failed", err);
      setCheckState("error");
      setCheckError("Network error. Please try again in a minute.");
      window.setTimeout(() => setCheckState("idle"), 10000);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate program
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          You&apos;re in - one last step.
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Activate your tracked referral link by completing a 30-second signup on Lemon Squeezy.
          Once they confirm you, your full affiliate dashboard unlocks automatically.
        </p>
      </header>

      <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-4 sm:p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">
          Step 1 - Finalize on Lemon Squeezy
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Sign up using the <strong>same email</strong> you used to apply here, so we can match your
          account. Once Lemon Squeezy approves your profile, come back to this page and your tracked
          link will appear automatically.
        </p>

        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">What to expect</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>
              You&apos;ll land on Lemon Squeezy&apos;s sign-in page. If this is your first time,
              click <strong>Sign up</strong> at the bottom and create an account with the same email
              you used here.
            </li>
            <li>
              Lemon Squeezy will ask you to complete a short <strong>affiliate profile</strong>:
              a bio, the websites or social channels you&apos;ll promote on, and your audience size.
              Submit it for approval.
            </li>
            <li>
              Once approved (usually under 48 hours), Lemon Squeezy notifies us automatically and
              this page unlocks your tracked link and dashboard. No store setup, no products, no
              identity verification.
            </li>
          </ol>
          <p className="mt-3 text-sm text-slate-700">
            <strong>To actually get paid</strong>, head to the <strong>Payouts</strong> tab inside
            the Lemon Squeezy Affiliate Hub and add a payout method (PayPal or bank). You can do
            this any time before your first payout.
          </p>
        </div>

        {signupUrl ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={signupUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Complete signup on Lemon Squeezy →
            </a>
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={checkState === "checking" || checkState === "found"}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkState === "checking"
                ? "Checking..."
                : checkState === "found"
                  ? "Linked! Reloading..."
                  : "Already signed up? Check status now"}
            </button>
          </div>
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

        {checkState === "not_found" ? (
          <p className="mt-3 text-sm text-slate-600">
            We don&apos;t see your Lemon Squeezy affiliate yet. Give it a minute, or double-check
            you used the same email
            {userEmail ? (
              <>
                {" "}(<code className="font-mono text-slate-800">{userEmail}</code>)
              </>
            ) : null}{" "}
            when signing up on Lemon Squeezy.
          </p>
        ) : null}

        {checkState === "error" && checkError ? (
          <p className="mt-3 text-sm text-amber-700">
            {checkError} If this keeps happening, email{" "}
            <a
              href="mailto:hello@influencerbutler.com"
              className="font-medium underline underline-offset-2"
            >
              hello@influencerbutler.com
            </a>
            .
          </p>
        ) : null}

        <p className="mt-3 text-xs text-slate-500">
          Your branded share code, per-channel link builder, and click tracking unlock right after
          Lemon Squeezy confirms you. Just refresh this page once signup is done.
        </p>
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
