import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchLsAffiliate, formatUsdFromCents, buildShareLink } from "@/lib/affiliates";
import ShareLinkCard from "./ShareLinkCard";

export const dynamic = "force-dynamic";

type ProfileRow = {
  is_affiliate?: boolean | null;
  ls_affiliate_id?: string | null;
  full_name?: string | null;
  email?: string | null;
};

type ApplicationRow = {
  status?: string | null;
  created_at?: string | null;
};

type SupabaseLike = {
  auth: {
    getSession: () => Promise<{
      data: { session: { user?: { id?: string; email?: string | null } } | null };
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
      };
    };
  };
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export default async function AffiliatePortalPage() {
  const supabase = (await createClient()) as unknown as SupabaseLike;

  // Cookie-local session read — the layout already gated this page, this is
  // just to get the user id + email without a network round-trip.
  let sessionUser: { id?: string; email?: string | null } | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    sessionUser = session?.user ?? null;
  } catch (error) {
    console.error("affiliate portal page: auth.getSession threw", error);
  }

  if (!sessionUser?.id) {
    // Layout already redirects, but keep the guard.
    return null;
  }
  const user = { id: sessionUser.id, email: sessionUser.email ?? null };

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_affiliate,ls_affiliate_id,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? {}) as ProfileRow;

  const { data: applicationData } = await supabase
    .from("affiliate_applications")
    .select("status,created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const application = (applicationData ?? null) as ApplicationRow | null;

  const displayName = profile.full_name?.trim() || user.email || "there";
  const lsAffiliateId = profile.ls_affiliate_id ?? null;

  if (!lsAffiliateId) {
    return (
      <PendingState
        displayName={displayName}
        hasApplication={Boolean(application)}
        submittedAt={application?.created_at ?? null}
      />
    );
  }

  const summary = await fetchLsAffiliate(lsAffiliateId);

  if (!summary) {
    return (
      <ErrorState displayName={displayName} />
    );
  }

  const isActive = summary.status === "active";
  const shareLink = buildShareLink(summary.shareDomain, lsAffiliateId);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate portal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome back, {displayName}.</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your referral stats, powered by Lemon Squeezy. Updated{" "}
          {summary.updatedAt ? formatDate(summary.updatedAt) : "moments ago"}.
        </p>
      </header>

      {!isActive ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your affiliate account is currently <strong>{summary.status}</strong>. Earnings tracking is paused
          until it&apos;s reactivated. Reach out to{" "}
          <a
            href="mailto:hello@influencerbutler.com"
            className="font-medium underline underline-offset-2"
          >
            hello@influencerbutler.com
          </a>
          .
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total earned"
          value={formatUsdFromCents(summary.totalEarningsCents)}
          hint="Lifetime commissions"
        />
        <StatCard
          label="Unpaid earnings"
          value={formatUsdFromCents(summary.unpaidEarningsCents)}
          hint="Next payout balance"
        />
        <StatCard
          label="Products promoted"
          value={summary.productsCount.toString()}
          hint="Eligible for commission"
        />
      </section>

      {isActive ? (
        <ShareLinkCard shareLink={shareLink} shareDomain={summary.shareDomain} />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <InfoRow label="Member since" value={formatDate(summary.createdAt)} />
        <InfoRow
          label="Commission rate"
          value="35% recurring"
          hint="For the life of every subscription"
        />
        <InfoRow label="Cookie window" value="30 days" hint="Last-click attribution" />
        <InfoRow label="Payout processor" value="Lemon Squeezy" hint="Paid monthly" />
      </section>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Need help or want to see payout history?{" "}
        <a
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-[#f97316] hover:text-[#ea580c]"
        >
          Contact our affiliate team
        </a>
        .
      </div>
    </div>
  );
}

function PendingState({
  displayName,
  hasApplication,
  submittedAt,
}: {
  displayName: string;
  hasApplication: boolean;
  submittedAt: string | null;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate portal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome, {displayName}.</h1>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {hasApplication ? (
          <>
            <h2 className="text-xl font-semibold text-slate-900">
              Your application is under review
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Submitted {submittedAt ? formatDate(submittedAt) : "recently"}. Our team reviews new affiliates
              weekly — you&apos;ll hear back via email, usually within 48 hours.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-slate-900">
              You haven&apos;t applied yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Complete a short application to join the program and start earning 35% recurring commission.
            </p>
            <Link
              href="/affiliates/apply"
              className="mt-5 inline-flex rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c]"
            >
              Start application
            </Link>
          </>
        )}

        <ol className="mt-8 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">1.</span>
            <span>Apply — tell us about your audience and how you plan to promote.</span>
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
        Questions about the program? Email{" "}
        <a
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-[#f97316] hover:text-[#ea580c]"
        >
          hello@influencerbutler.com
        </a>
        .
      </div>
    </div>
  );
}

function ErrorState({ displayName }: { displayName: string }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate portal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Hi, {displayName}.</h1>
      </header>
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
        We couldn&apos;t load your affiliate stats right now. Please try again in a minute — or reach out to{" "}
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}

function InfoRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
