// Daily-digest data assembly.
//
// Gathers everything the twice-daily owner summary email needs, in one call,
// from the same Supabase tables the admin dashboard reads. No HTML here: this
// module returns a typed DigestData object; src/lib/digest-email.ts renders and
// sends it.
//
// Two variants:
//   - "morning": a recap of the PRIOR local calendar day.
//   - "evening": everything so far TODAY (local day start -> now).
// "Local" means the configured timezone (Mountain Time by default). All windows
// and per-day buckets are computed in that zone so the numbers match what the
// owner experiences as "today" / "yesterday".
//
// Everything is best-effort per section: a failed query nulls or empties that
// section instead of breaking the email, mirroring the growth-snapshot engine.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeGrowthSnapshot,
  deltaPercent,
  monthKey,
  type SnapshotClient,
} from "@/lib/growth-metrics";
import { listCancellations, countUnsurveyedEndedSubs, reasonLabel } from "@/lib/cancel-reasons";
import { SEED_SOURCE } from "@/lib/recent-activity";
import { maskEmail } from "@/lib/mask-email";

export const DEFAULT_DIGEST_TIMEZONE = "America/Denver";
const TREND_DAYS = 14;
const ROW_LIMIT = 10000;

export type DigestVariant = "morning" | "evening";

export type LocationCount = { label: string; count: number };
export type CancelReasonCount = { label: string; count: number };

export type DigestMetric = {
  /** Count within the "since last digest" window (the target local day). */
  window: number;
  /** Month-to-date running total, or null when unknown. */
  mtd: number | null;
  /** Month-over-month change as a fraction (0.1 = +10%), or null. */
  momDelta: number | null;
};

export type DigestSeries = { labels: string[]; values: number[] };

export type TrialListItem = {
  emailMasked: string | null;
  plan: string | null;
  startedAt: string | null;
  renewsAt: string | null;
};

export type CancelListItem = {
  emailMasked: string | null;
  plan: string | null;
  reasonLabel: string;
  wouldReturn: string | null;
  createdAt: string;
};

export type DigestData = {
  variant: DigestVariant;
  tz: string;
  generatedAtIso: string;
  /** e.g. "Yesterday, Sat Aug 2" or "Today so far, Sun Aug 3". */
  windowLabel: string;
  /** e.g. "morning recap" / "evening update". */
  periodLabel: string;
  monthLabel: string;
  metrics: {
    trialClicks: DigestMetric;
    trialsStarted: DigestMetric;
    conversions: DigestMetric;
    newSubs: DigestMetric;
    revenueCents: DigestMetric;
    cancellations: DigestMetric;
  };
  running: {
    activeSubscribers: number | null;
    onTrialNow: number | null;
    revenueMtdCents: number | null;
  };
  trends: {
    trialClicks: DigestSeries;
    trialsStarted: DigestSeries;
  };
  locations: LocationCount[];
  locationTotal: number;
  onTrialList: TrialListItem[];
  cancellations: {
    recent: CancelListItem[];
    reasonCounts: CancelReasonCount[];
    unsurveyedEnded: number | null;
  };
  migrationPending: boolean;
};

// ---------------------------------------------------------------------------
// Timezone helpers (no date library; Intl only)
// ---------------------------------------------------------------------------

type LocalParts = { year: number; month: number; day: number; hour: number };

/** Wall-clock Y/M/D/H in a timezone for a given instant. */
export function localParts(date: Date, tz: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

/** "YYYY-MM-DD" wall-clock date in a timezone. */
function localDateStr(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset (localWall - UTC) in ms for an instant in a timezone. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/** The UTC instant of a wall-clock time (y,m,d,h:00) in a timezone. */
export function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, h, 0, 0);
  const offset = tzOffsetMs(new Date(guess), tz);
  let instant = guess - offset;
  // One refinement handles the DST transition where the first guess landed in
  // the wrong offset.
  const offset2 = tzOffsetMs(new Date(instant), tz);
  if (offset2 !== offset) instant = guess - offset2;
  return new Date(instant);
}

/** Short, friendly date label like "Sat Aug 2" in the given timezone. */
function friendlyDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Small query helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Buckets timestamp rows into a TREND_DAYS series keyed by local date string. */
function seriesFrom(
  rows: Row[],
  tsCol: string,
  tz: string,
  dayStrings: string[],
  value: (row: Row) => number = () => 1,
): number[] {
  const idx = new Map<string, number>();
  dayStrings.forEach((s, i) => idx.set(s, i));
  const out = new Array<number>(dayStrings.length).fill(0);
  for (const row of rows) {
    const ts = str(row[tsCol]);
    if (!ts) continue;
    const key = localDateStr(new Date(ts), tz);
    const i = idx.get(key);
    if (i !== undefined) out[i] += value(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function computeDigest(opts: {
  now?: Date;
  tz?: string;
  variant?: DigestVariant;
}): Promise<DigestData> {
  const tz = opts.tz || DEFAULT_DIGEST_TIMEZONE;
  const now = opts.now ?? new Date();
  const nowParts = localParts(now, tz);
  // Default variant: mornings (before noon local) recap yesterday; afternoons
  // and evenings report today so far.
  const variant: DigestVariant = opts.variant ?? (nowParts.hour < 12 ? "morning" : "evening");

  // The 14 local-day date strings ending today, oldest first. Anchor at local
  // noon of each day so day subtraction never trips over a DST boundary.
  const todayNoonUtc = zonedTimeToUtc(nowParts.year, nowParts.month, nowParts.day, 12, tz);
  const dayStrings: string[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    dayStrings.push(localDateStr(new Date(todayNoonUtc.getTime() - i * 86400000), tz));
  }
  const todayStr = dayStrings[dayStrings.length - 1];
  const yesterdayStr = dayStrings[dayStrings.length - 2];
  // The window "since the last digest" is exactly the target local day: today
  // for the evening update, yesterday for the morning recap.
  const targetStr = variant === "morning" ? yesterdayStr : todayStr;
  const targetIdx = dayStrings.indexOf(targetStr);

  // Fetch bound: local midnight of the oldest trend day.
  const [fy, fm, fd] = dayStrings[0].split("-").map(Number);
  const fetchStartIso = zonedTimeToUtc(fy, fm, fd, 0, tz).toISOString();
  const nowIso = now.toISOString();

  const admin = createAdminClient();
  const addonVariant = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON ?? "";
  const isAddon = (row: Row) =>
    addonVariant !== "" && String(row.ls_variant_id ?? "") === addonVariant;

  const monthStr = monthKey(new Date(zonedTimeToUtc(nowParts.year, nowParts.month, 1, 0, tz)));
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    year: "numeric",
  }).format(now);

  // Kick everything off in parallel; each guarded so one failure nulls its slice.
  const [
    snapshot,
    trialClickRows,
    trialStartedRows,
    conversionRows,
    newSubRows,
    orderRows,
    cancelRows,
    onTrialRows,
    cancellationsDetail,
    unsurveyedEnded,
    cancelMtd,
  ] = await Promise.all([
    computeGrowthSnapshot(admin as unknown as SnapshotClient, monthStr).catch(() => null),
    safeRows(() =>
      admin
        .from("activity_events")
        .select("created_at,city,region,country,source")
        .eq("kind", "trial_click")
        .eq("is_bot", false)
        .gte("created_at", fetchStartIso)
        .limit(ROW_LIMIT),
    ),
    safeRows(() =>
      admin
        .from("subscriptions")
        .select("trial_started_at")
        .not("trial_started_at", "is", null)
        .gte("trial_started_at", fetchStartIso)
        .limit(ROW_LIMIT),
    ),
    // Best-effort: trial_converted_at may not exist in prod yet.
    safeRows(() =>
      admin
        .from("subscriptions")
        .select("trial_converted_at")
        .not("trial_converted_at", "is", null)
        .gte("trial_converted_at", fetchStartIso)
        .limit(ROW_LIMIT),
    ),
    safeRows(() =>
      admin
        .from("subscriptions")
        .select("created_at,ls_variant_id")
        .gte("created_at", fetchStartIso)
        .limit(ROW_LIMIT),
    ),
    safeRows(() =>
      admin
        .from("orders")
        .select("created_at,total")
        .eq("status", "paid")
        .gte("created_at", fetchStartIso)
        .limit(ROW_LIMIT),
    ),
    safeRows(() =>
      admin
        .from("subscription_cancel_reasons")
        .select("created_at,reason")
        .gte("created_at", fetchStartIso)
        .limit(ROW_LIMIT),
    ),
    safeRows(() =>
      admin
        .from("subscriptions")
        .select("user_id,plan_name,trial_started_at,renews_at,ls_variant_id")
        .eq("status", "on_trial")
        .limit(ROW_LIMIT),
    ),
    listCancellations(60).catch(() => []),
    countUnsurveyedEndedSubs().catch(() => null),
    monthCount(admin, "subscription_cancel_reasons", "created_at", monthStr, tz, nowParts),
  ]);

  // --- Trial clicks (seed-excluded, from activity_events) -------------------
  const realClicks = trialClickRows.filter((r) => str(r.source) !== SEED_SOURCE);
  const clickSeries = seriesFrom(realClicks, "created_at", tz, dayStrings);
  const clickWindow = targetIdx >= 0 ? clickSeries[targetIdx] : 0;

  // --- Other window counts from the 14-day series ---------------------------
  const trialStartedSeries = seriesFrom(trialStartedRows, "trial_started_at", tz, dayStrings);
  const conversionSeries = seriesFrom(conversionRows, "trial_converted_at", tz, dayStrings);
  const newSubSeries = seriesFrom(
    newSubRows.filter((r) => !isAddon(r)),
    "created_at",
    tz,
    dayStrings,
  );
  const revenueSeries = seriesFrom(orderRows, "created_at", tz, dayStrings, (r) => num(r.total));
  const cancelSeries = seriesFrom(cancelRows, "created_at", tz, dayStrings);
  const at = (s: number[]) => (targetIdx >= 0 ? s[targetIdx] : 0);

  const snapMetric = (key: string): { current: number | null; previous: number | null } => {
    const m = snapshot?.metrics?.[key];
    return { current: m?.current ?? null, previous: m?.previous ?? null };
  };
  const trialsSnap = snapMetric("trials_started");
  const convSnap = snapMetric("trial_conversions");
  const newSubSnap = snapMetric("new_subscriptions");
  const revenueSnap = snapMetric("revenue_cents");

  const migrationPending = Boolean(snapshot?.migrationPending) || conversionRows.length === 0;

  // --- Location breakdown for the window (target day only) ------------------
  const windowClicks = realClicks.filter((r) => localDateStr(new Date(str(r.created_at) ?? nowIso), tz) === targetStr);
  const locations = topLocations(windowClicks);
  const locationTotal = windowClicks.length;

  // --- On trial now ---------------------------------------------------------
  const onTrialClean = onTrialRows.filter((r) => !isAddon(r));
  const onTrialList = await buildOnTrialList(admin, onTrialClean);

  // --- Cancellations detail (window + reason tally) -------------------------
  const recentCancels: CancelListItem[] = cancellationsDetail
    .filter((c) => c.createdAt && localDateStr(new Date(c.createdAt), tz) === targetStr)
    .slice(0, 10)
    .map((c) => ({
      emailMasked: c.emailMasked,
      plan: c.planName,
      reasonLabel: c.reasonLabel,
      wouldReturn: c.wouldReturn,
      createdAt: c.createdAt,
    }));
  const reasonTally = new Map<string, number>();
  for (const r of cancelRows) {
    const key = localDateStr(new Date(str(r.created_at) ?? nowIso), tz);
    if (key !== targetStr) continue;
    const label = reasonLabel(str(r.reason));
    reasonTally.set(label, (reasonTally.get(label) ?? 0) + 1);
  }
  const reasonCounts = Array.from(reasonTally.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const targetDate = new Date(zonedTimeToUtc(...(targetStr.split("-").map(Number) as [number, number, number]), 12, tz));
  const windowLabel =
    variant === "morning"
      ? `Yesterday, ${friendlyDate(targetDate, tz)}`
      : `Today so far, ${friendlyDate(targetDate, tz)}`;

  return {
    variant,
    tz,
    generatedAtIso: nowIso,
    windowLabel,
    periodLabel: variant === "morning" ? "morning recap" : "evening update",
    monthLabel,
    metrics: {
      trialClicks: {
        window: clickWindow,
        mtd: snapshot?.metrics?.trial_clicks?.current ?? null,
        momDelta: deltaPercent(
          snapshot?.metrics?.trial_clicks?.current ?? null,
          snapshot?.metrics?.trial_clicks?.previous ?? null,
        ),
      },
      trialsStarted: {
        window: at(trialStartedSeries),
        mtd: trialsSnap.current,
        momDelta: deltaPercent(trialsSnap.current, trialsSnap.previous),
      },
      conversions: {
        window: at(conversionSeries),
        mtd: migrationPending ? null : convSnap.current,
        momDelta: migrationPending ? null : deltaPercent(convSnap.current, convSnap.previous),
      },
      newSubs: {
        window: at(newSubSeries),
        mtd: newSubSnap.current,
        momDelta: deltaPercent(newSubSnap.current, newSubSnap.previous),
      },
      revenueCents: {
        window: at(revenueSeries),
        mtd: revenueSnap.current,
        momDelta: deltaPercent(revenueSnap.current, revenueSnap.previous),
      },
      cancellations: {
        window: at(cancelSeries),
        mtd: cancelMtd,
        momDelta: null,
      },
    },
    running: {
      activeSubscribers: snapshot?.metrics?.active_subscriptions?.current ?? null,
      onTrialNow: snapshot?.metrics?.on_trial_subscriptions?.current ?? onTrialClean.length,
      revenueMtdCents: revenueSnap.current,
    },
    trends: {
      trialClicks: { labels: dayStrings, values: clickSeries },
      trialsStarted: { labels: dayStrings, values: trialStartedSeries },
    },
    locations,
    locationTotal,
    onTrialList,
    cancellations: {
      recent: recentCancels,
      reasonCounts,
      unsurveyedEnded,
    },
    migrationPending,
  };
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;

async function safeRows(run: () => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  try {
    const res = await run();
    if (res.error) {
      console.error("daily-digest: query failed", res.error);
      return [];
    }
    return res.data ?? [];
  } catch (err) {
    console.error("daily-digest: query threw", err);
    return [];
  }
}

/** Count rows in `table` for the current local month, best-effort. */
async function monthCount(
  admin: AdminClient,
  table: string,
  tsCol: string,
  month: string,
  tz: string,
  nowParts: LocalParts,
): Promise<number | null> {
  try {
    const startIso = zonedTimeToUtc(nowParts.year, nowParts.month, 1, 0, tz).toISOString();
    const res = await admin
      .from(table)
      .select(tsCol)
      .gte(tsCol, startIso)
      .limit(ROW_LIMIT);
    if (res.error) return null;
    return (res.data ?? []).length;
  } catch {
    return null;
  }
}

/** Groups trial-click rows into a top-6 location list. */
function topLocations(rows: Row[]): LocationCount[] {
  const tally = new Map<string, number>();
  for (const r of rows) {
    const city = str(r.city);
    const region = str(r.region);
    const country = str(r.country);
    const label =
      [city, region, country].filter(Boolean).join(", ") || "Unknown location";
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/** Resolves masked emails for the on-trial-now list. */
async function buildOnTrialList(admin: AdminClient, rows: Row[]): Promise<TrialListItem[]> {
  const sorted = [...rows].sort((a, b) => {
    const ra = str(a.renews_at) ?? "";
    const rb = str(b.renews_at) ?? "";
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
  const top = sorted.slice(0, 8);
  const userIds = Array.from(
    new Set(top.map((r) => str(r.user_id)).filter(Boolean)),
  ) as string[];

  const emailByUser = new Map<string, string | null>();
  if (userIds.length > 0) {
    try {
      const { data } = await admin.from("profiles").select("id,email").in("id", userIds);
      for (const p of data ?? []) {
        const id = str(p.id);
        if (id) emailByUser.set(id, str(p.email));
      }
    } catch {
      /* best-effort */
    }
  }

  return top.map((r) => {
    const uid = str(r.user_id);
    return {
      emailMasked: uid ? maskEmail(emailByUser.get(uid) ?? null) : null,
      plan: str(r.plan_name),
      startedAt: str(r.trial_started_at),
      renewsAt: str(r.renews_at),
    };
  });
}

// ---------------------------------------------------------------------------
// Sample data (design preview, no DB)
// ---------------------------------------------------------------------------

export function sampleDigestData(variant: DigestVariant = "morning"): DigestData {
  const clicks = [4, 7, 3, 9, 12, 6, 8, 5, 11, 14, 9, 7, 13, 10];
  const trials = [0, 1, 0, 2, 1, 0, 1, 1, 2, 3, 1, 0, 2, 2];
  const labels = clicks.map((_, i) => `2026-07-${String(21 + i).padStart(2, "0")}`);
  return {
    variant,
    tz: DEFAULT_DIGEST_TIMEZONE,
    generatedAtIso: "2026-08-03T13:00:00.000Z",
    windowLabel: variant === "morning" ? "Yesterday, Sat Aug 2" : "Today so far, Sun Aug 3",
    periodLabel: variant === "morning" ? "morning recap" : "evening update",
    monthLabel: "August 2026",
    metrics: {
      trialClicks: { window: 23, mtd: 214, momDelta: 0.18 },
      trialsStarted: { window: 3, mtd: 27, momDelta: 0.35 },
      conversions: { window: 1, mtd: 9, momDelta: 0.12 },
      newSubs: { window: 1, mtd: 11, momDelta: -0.08 },
      revenueCents: { window: 13861, mtd: 184300, momDelta: 0.22 },
      cancellations: { window: 1, mtd: 4, momDelta: null },
    },
    running: { activeSubscribers: 96, onTrialNow: 7, revenueMtdCents: 184300 },
    trends: {
      trialClicks: { labels, values: clicks },
      trialsStarted: { labels, values: trials },
    },
    locations: [
      { label: "Dallas, TX, US", count: 5 },
      { label: "Houston, TX, US", count: 4 },
      { label: "Chicago, IL, US", count: 3 },
      { label: "Hong Kong, HK", count: 2 },
      { label: "Apex, NC, US", count: 2 },
      { label: "The Dalles, OR, US", count: 1 },
    ],
    locationTotal: 23,
    onTrialList: [
      { emailMasked: "j***@gmail.com", plan: "Pro", startedAt: "2026-08-01T10:00:00Z", renewsAt: "2026-08-04T10:00:00Z" },
      { emailMasked: "k***@yahoo.com", plan: "Pro", startedAt: "2026-08-02T14:00:00Z", renewsAt: "2026-08-05T14:00:00Z" },
      { emailMasked: "a***@outlook.com", plan: "Pro", startedAt: "2026-08-02T18:00:00Z", renewsAt: "2026-08-05T18:00:00Z" },
    ],
    cancellations: {
      recent: [
        {
          emailMasked: "d***@gmail.com",
          plan: "Pro",
          reasonLabel: "Not using it enough",
          wouldReturn: "maybe",
          createdAt: "2026-08-02T20:00:00Z",
        },
      ],
      reasonCounts: [{ label: "Not using it enough", count: 1 }],
      unsurveyedEnded: 2,
    },
    migrationPending: false,
  };
}
