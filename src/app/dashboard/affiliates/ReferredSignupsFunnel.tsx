"use client";

import { useEffect, useState } from "react";
import {
  REFERRED_EVENTS_RECENT_VISIBLE,
  type ReferredChannel,
  type ReferredEvent,
  type ReferredFunnel,
  type ReferredInsights,
} from "@/lib/referred-signups";
import { formatUsdFromCents } from "@/lib/affiliates";

/**
 * "Referred signups" funnel panel for the self-hosted affiliate dashboard.
 * Shows how many people created an account through the affiliate's link
 * (free, trial, and paid stages) plus an anonymous recent-activity feed -
 * event type and date only, never who the customer is.
 */

type Payload = {
  migrationPending: boolean;
  funnel: ReferredFunnel;
  events: ReferredEvent[];
  insights?: ReferredInsights;
};

const EMPTY_FUNNEL: ReferredFunnel = {
  signups: 0,
  trialsStarted: 0,
  paid: 0,
  activeSubscriptions: 0,
  cancelled: 0,
};

const EVENT_LABELS: Record<ReferredEvent["type"], string> = {
  signup: "New signup",
  trial_started: "Trial started",
  trial_converted: "Trial converted to paid",
  subscription_started: "New paid subscription",
  cancelled: "Subscription cancelled",
  comp_makewhole: "Comp make-whole",
};

const CHANNEL_LABELS: Record<ReferredChannel, string> = {
  web: "Website",
  extension: "Extension",
  desktop: "Desktop app",
};

// Small tint per source so an affiliate can eyeball their channel mix.
const CHANNEL_PILL: Record<ReferredChannel, string> = {
  web: "bg-sky-50 text-sky-700 ring-sky-200",
  extension: "bg-violet-50 text-violet-700 ring-violet-200",
  desktop: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function SourcePill({ channel }: { channel: ReferredChannel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CHANNEL_PILL[channel]}`}
    >
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

function sourceTotal(insights: ReferredInsights): number {
  return insights.bySource.web + insights.bySource.extension + insights.bySource.desktop;
}

function eventDate(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

export default function ReferredSignupsFunnel({
  endpoint = "/api/affiliates/referred-signups",
}: {
  endpoint?: string;
} = {}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load (${res.status})`);
          return;
        }
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error("referred-signups fetch failed", err);
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const funnel = data?.funnel ?? EMPTY_FUNNEL;
  const events = data?.events ?? [];
  const insights = data?.insights;
  const visibleEvents = showAll ? events : events.slice(0, REFERRED_EVENTS_RECENT_VISIBLE);
  const isEmpty =
    !loading &&
    !data?.migrationPending &&
    events.length === 0 &&
    Object.values(funnel).every((n) => n === 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Referred signups
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Everyone who created an account through your link, including free and trial users. Fully
          anonymous: we never show who they are.
        </p>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      {data?.migrationPending ? (
        <p className="mt-4 text-sm text-slate-500">
          Signup tracking is being set up. Check back soon.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FunnelStat
              label="Signups"
              value={funnel.signups}
              hint="Free accounts from your link"
              loading={loading}
            />
            <FunnelStat
              label="Trials started"
              value={funnel.trialsStarted}
              hint="Started a free trial"
              loading={loading}
            />
            <FunnelStat
              label="Converted to paid"
              value={funnel.paid}
              hint="Trials that converted, plus direct buys"
              loading={loading}
            />
            <FunnelStat
              label="Active now"
              value={funnel.activeSubscriptions}
              hint="Currently paying"
              loading={loading}
            />
            <FunnelStat
              label="Cancelled"
              value={funnel.cancelled}
              hint="No longer subscribed"
              loading={loading}
            />
          </div>

          {!loading && insights && funnel.signups > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InsightStat
                label="Signup to trial"
                value={
                  insights.conversionRates.signupToTrial === null
                    ? "-"
                    : `${insights.conversionRates.signupToTrial}%`
                }
                hint="Signups who start a trial"
              />
              <InsightStat
                label="Trial to paid"
                value={
                  insights.conversionRates.trialToPaid === null
                    ? "-"
                    : `${insights.conversionRates.trialToPaid}%`
                }
                hint="Trials that convert"
              />
            </div>
          ) : null}

          {!loading && insights && sourceTotal(insights) > 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Signups by source
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["extension", "web", "desktop"] as ReferredChannel[])
                  .filter((c) => insights.bySource[c] > 0)
                  .map((c) => (
                    <span
                      key={c}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${CHANNEL_PILL[c]}`}
                    >
                      {CHANNEL_LABELS[c]}
                      <span className="font-bold">{insights.bySource[c]}</span>
                    </span>
                  ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                This month: {insights.thisMonth.signups} signups, {insights.thisMonth.conversions}{" "}
                converted (last month: {insights.lastMonth.signups} signups,{" "}
                {insights.lastMonth.conversions} converted).
              </p>
            </div>
          ) : null}

          {insights && funnel.paid > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <InsightStat
                label="Avg. days to convert"
                value={
                  insights.avgDaysToConvert === null ? "-" : `${insights.avgDaysToConvert} days`
                }
                hint="Trial start to paid"
              />
              <InsightStat
                label="Avg. time subscribed"
                value={
                  insights.avgDaysSubscribed === null ? "-" : `${insights.avgDaysSubscribed} days`
                }
                hint="For those who have cancelled"
              />
              <InsightStat
                label="Plan mix"
                value={`${insights.planMix.monthly} monthly / ${insights.planMix.annual} annual`}
                hint="Among paying referrals"
              />
            </div>
          ) : null}

          {isEmpty ? (
            <p className="mt-5 text-sm text-slate-500">
              No referred signups yet - share your link!
            </p>
          ) : (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recent activity
              </p>
              {loading ? (
                <div className="mt-3 space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No activity yet.</p>
              ) : (
                <>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {visibleEvents.map((event, i) => (
                      <li
                        key={`${event.type}-${event.at}-${i}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-slate-700">
                            {EVENT_LABELS[event.type]}
                          </span>
                          {event.type === "comp_makewhole" && typeof event.amountCents === "number" ? (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                              +{formatUsdFromCents(event.amountCents)}
                            </span>
                          ) : (
                            <SourcePill channel={event.channel} />
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {eventDate(event.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {events.length > REFERRED_EVENTS_RECENT_VISIBLE ? (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-3 text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
                    >
                      {showAll ? "Show less" : `Show all (${events.length})`}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function InsightStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </article>
  );
}

function FunnelStat({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: number;
  hint: string;
  loading: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {loading ? (
          <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-200 align-middle" />
        ) : (
          value.toLocaleString()
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </article>
  );
}
