/**
 * GET /api/dashboard/earnings - the signed-in user's earnings snapshot as
 * synced from the desktop app (see /api/desktop/earnings-sync). Session cookie
 * auth only; deliberately NO entitlement gate: the web earnings view is a Free
 * tier feature.
 *
 * Reads go through the service-role client because the desktop_earnings_*
 * tables are RLS-enabled with zero policies. A missing table (migration not
 * applied to prod yet) answers { migrationPending: true } with empty data so
 * the page renders its empty state instead of an error.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { sumCategories, twelveMonthFloor, type NormalizedMonth } from "@/lib/desktop-earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MonthRow = {
  month: string;
  currency: string;
  onsite_cents: number | string;
  cc_cents: number | string;
  offsite_cents: number | string;
  brand_deal_cents: number | string;
  international_cents: number | string;
  bonus_cents: number | string;
  total_cents: number | string;
};

type AsinRow = {
  period: string;
  asin: string;
  marketplace: string;
  title: string | null;
  image_url: string | null;
  amount_cents: number | string;
  units: number;
  orders: number;
  rank: number;
};

type MetaRow = {
  last_synced_at: string;
  app_version: string | null;
  currency: string;
  offsite_tracked: boolean;
  months_count: number;
  asins_count: number;
};

// PostgREST returns bigint columns as strings; the dashboard wants numbers.
const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

function toMonth(r: MonthRow): NormalizedMonth & { currency: string } {
  return {
    month: r.month.slice(0, 10),
    currency: r.currency,
    onsiteCents: num(r.onsite_cents),
    ccCents: num(r.cc_cents),
    offsiteCents: num(r.offsite_cents),
    brandDealCents: num(r.brand_deal_cents),
    internationalCents: num(r.international_cents),
    bonusCents: num(r.bonus_cents),
    totalCents: num(r.total_cents),
  };
}

function toAsin(r: AsinRow) {
  return {
    period: r.period,
    asin: r.asin,
    marketplace: r.marketplace,
    title: r.title,
    imageUrl: r.image_url,
    amountCents: num(r.amount_cents),
    units: r.units ?? 0,
    orders: r.orders ?? 0,
    rank: r.rank ?? 0,
  };
}

const EMPTY = {
  ok: true,
  meta: null,
  months: [],
  totalsByCategory: null,
  topAsins: { all: [], "12m": [] },
  offsiteTracked: false,
};

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const userId = userData.user.id;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("dashboard/earnings: service-role client unavailable", err);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const [metaRes, monthsRes, asinsRes] = await Promise.all([
    admin
      .from("desktop_earnings_sync_meta")
      .select("last_synced_at, app_version, currency, offsite_tracked, months_count, asins_count")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("desktop_earnings_months")
      .select(
        "month, currency, onsite_cents, cc_cents, offsite_cents, brand_deal_cents, international_cents, bonus_cents, total_cents",
      )
      .eq("user_id", userId)
      .order("month", { ascending: true })
      .limit(240),
    admin
      .from("desktop_earnings_top_asins")
      .select("period, asin, marketplace, title, image_url, amount_cents, units, orders, rank")
      .eq("user_id", userId)
      .in("period", ["all", "12m"])
      .order("rank", { ascending: true })
      .limit(200),
  ]);

  const firstError = metaRes.error ?? monthsRes.error ?? asinsRes.error;
  if (firstError) {
    if (isMissingTableError(firstError)) {
      return NextResponse.json({ ...EMPTY, migrationPending: true });
    }
    console.error("dashboard/earnings: read failed", firstError);
    return NextResponse.json({ error: "Could not load earnings" }, { status: 500 });
  }

  const meta = (metaRes.data as MetaRow | null) ?? null;
  const months = ((monthsRes.data ?? []) as MonthRow[]).map(toMonth);
  const asins = ((asinsRes.data ?? []) as AsinRow[]).map(toAsin);

  let totalsByCategory: (ReturnType<typeof sumCategories> & { fromMonth: string; toMonth: string }) | null =
    null;
  if (months.length > 0) {
    const toMonthKey = months[months.length - 1].month;
    const fromMonth = twelveMonthFloor(toMonthKey);
    const window = months.filter((m) => m.month >= fromMonth && m.month <= toMonthKey);
    totalsByCategory = { ...sumCategories(window), fromMonth, toMonth: toMonthKey };
  }

  return NextResponse.json({
    ok: true,
    meta: meta
      ? {
          lastSyncedAt: meta.last_synced_at,
          appVersion: meta.app_version,
          currency: meta.currency,
          monthsCount: meta.months_count,
          asinsCount: meta.asins_count,
        }
      : null,
    months,
    totalsByCategory,
    topAsins: {
      all: asins.filter((a) => a.period === "all"),
      "12m": asins.filter((a) => a.period === "12m"),
    },
    offsiteTracked: meta?.offsite_tracked === true,
  });
}
