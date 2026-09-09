import Link from "next/link";
import Countdown from "./Countdown";
import leaderboard from "../../../content/leaderboard.json";

export const metadata = {
  title: "Top Affiliates Leaderboard",
  description:
    "See the top Influencer Butler affiliates by referrals this month, the current referral challenge, and how to join. Live countdown to the deadline.",
  alternates: { canonical: "/leaderboard" },
};

type Trend = "up" | "down" | "new";

type Entry = {
  rank: number;
  name: string;
  referrals: number;
  trend?: Trend;
};

// Human-friendly "last updated" without timezone drift: anchor the date at
// midday UTC so the calendar day never shifts across the parse.
function formatUpdated(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function TrendBadge({ trend }: { trend?: Trend }) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <span aria-hidden>▲</span>
        <span className="sr-only">Moving up. </span>Up
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
        <span aria-hidden>▼</span>
        <span className="sr-only">Moving down. </span>Down
      </span>
    );
  }
  if (trend === "new") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f97316]/10 px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
        <span className="sr-only">New this period. </span>New
      </span>
    );
  }
  return null;
}

export default function LeaderboardPage() {
  const { lastUpdated, challenge } = leaderboard;
  const entries = ([...leaderboard.entries] as Entry[])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const leader = entries[0];
  const rest = entries.slice(1);

  return (
    <>
      {/* Challenge banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#f97316] to-amber-500 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-6 py-12 text-center sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Affiliate Challenge
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {challenge.headline}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-white/90">
            {challenge.reward}
          </p>

          <div className="mt-8 flex justify-center">
            <Countdown deadline={challenge.deadline} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={challenge.applyHref}
              className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-[#c2410c] shadow-sm transition hover:bg-white/90"
            >
              Join the challenge →
            </Link>
            <Link
              href="/login?next=/dashboard/affiliates"
              className="rounded-xl border border-white/50 bg-white/10 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/20"
            >
              Affiliate login
            </Link>
          </div>
        </div>
      </section>

      {/* Board */}
      <section className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c2410c]">
              This month
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Top 5 Affiliates
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Ranked by referrals. Updated {formatUpdated(lastUpdated)}.
          </p>
        </div>

        {/* #1 standout */}
        {leader ? (
          <div className="mt-8 rounded-3xl border-2 border-[#f97316] bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-md sm:p-8">
            <div className="flex items-center gap-4 sm:gap-6">
              <div
                className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-[#f97316] to-amber-500 text-3xl shadow-sm sm:h-20 sm:w-20"
                aria-hidden
              >
                👑
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#c2410c]">
                    #1 this month
                  </span>
                  <TrendBadge trend={leader.trend} />
                </div>
                <p className="mt-1 truncate text-2xl font-bold text-slate-900 sm:text-3xl">
                  {leader.name}
                </p>
              </div>
              <div className="flex-none text-right">
                <p className="text-3xl font-black tabular-nums text-[#c2410c] sm:text-4xl">
                  {leader.referrals}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Referrals
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Ranks 2-5 */}
        <ol className="mt-4 space-y-3">
          {rest.map((entry) => (
            <li
              key={entry.rank}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-6 sm:p-5"
            >
              <span
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-700"
                aria-hidden
              >
                {entry.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-lg font-semibold text-slate-900">
                    <span className="sr-only">Rank {entry.rank}: </span>
                    {entry.name}
                  </p>
                  <TrendBadge trend={entry.trend} />
                </div>
              </div>
              <div className="flex-none text-right">
                <p className="text-xl font-bold tabular-nums text-slate-900">
                  {entry.referrals}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Referrals
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* Footer CTA */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center sm:p-8">
          <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Want your handle on this board?
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Every subscription you refer pays 30% recurring for 12 months. Apply
            in about two minutes and start climbing.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={challenge.applyHref}
              className="rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Become an affiliate →
            </Link>
            <Link
              href="/affiliates"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-[#f97316] hover:text-[#c2410c]"
            >
              How the program works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
