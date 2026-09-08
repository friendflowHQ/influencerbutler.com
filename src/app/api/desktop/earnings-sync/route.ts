/**
 * POST /api/desktop/earnings-sync - the Influencer Butler DESKTOP app pushes a
 * snapshot of the user's Earnings Intelligence data ("Sync to web") so the
 * read-only /dashboard/earnings page (and their phone) can show it.
 *
 * Bearer only: the desktop app authenticates with the user's license key
 * (Authorization: Bearer <key>), the same key_hash lookup the extension and
 * /api/desktop/attribution use. Payload validation lives in
 * src/lib/desktop-earnings.ts (normalizeEarningsPayload) so it is unit-tested
 * without a database.
 *
 * Write semantics (the desktop app is the source of truth):
 *   - month rows are REPLACED inside the posted min..max month range: upsert
 *     the posted months, then delete any row in that range that was not
 *     posted. Months older than the range are left untouched;
 *   - top ASINs upsert on (user_id, period, asin) and, for every posted
 *     period, rows absent from the payload are deleted;
 *   - the sync meta row records when/what was synced.
 *
 * Tables are RLS-enabled with zero policies (see
 * supabase/migrations/20260910_desktop_earnings.sql), so all writes go through
 * the service-role client after auth. Until that migration is applied to prod
 * the route answers { migrationPending: true } instead of a 500.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";
import { normalizeEarningsPayload } from "@/lib/desktop-earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A month row exists for every posted month, and a normalised payload never
// exceeds 120 months / 50 ASINs per period, so the `not in (...)` filters stay
// well inside PostgREST's URL limits.
const pgList = (values: readonly string[]): string => `(${values.join(",")})`;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const payload = normalizeEarningsPayload(body);
  if (!payload.ok) return jsonWithCors({ error: payload.error }, 400);

  const userId = auth.auth.userId;
  const admin = createAdminClient();

  // 1. Months: upsert, then prune the posted range down to exactly what was sent.
  if (payload.months.length > 0 && payload.monthRange) {
    const rows = payload.months.map((m) => ({
      user_id: userId,
      month: m.month,
      currency: payload.currency,
      onsite_cents: m.onsiteCents,
      cc_cents: m.ccCents,
      offsite_cents: m.offsiteCents,
      brand_deal_cents: m.brandDealCents,
      international_cents: m.internationalCents,
      bonus_cents: m.bonusCents,
      total_cents: m.totalCents,
      synced_at: payload.syncedAt,
    }));
    const { error: upsertError } = await admin
      .from("desktop_earnings_months")
      .upsert(rows, { onConflict: "user_id,month" });
    if (upsertError) {
      if (isMissingTableError(upsertError)) return migrationPendingResponse();
      console.error("desktop/earnings-sync: months upsert failed", upsertError);
      return jsonWithCors({ error: "Could not save months" }, 500);
    }
    const { error: pruneError } = await admin
      .from("desktop_earnings_months")
      .delete()
      .eq("user_id", userId)
      .gte("month", payload.monthRange.min)
      .lte("month", payload.monthRange.max)
      .not("month", "in", pgList(payload.months.map((m) => m.month)));
    if (pruneError) {
      console.error("desktop/earnings-sync: months prune failed", pruneError);
      return jsonWithCors({ error: "Could not replace months" }, 500);
    }
  }

  // 2. Top ASINs: upsert, then prune each posted period to exactly what was sent.
  if (payload.topAsins.length > 0) {
    const rows = payload.topAsins.map((a) => ({
      user_id: userId,
      period: a.period,
      asin: a.asin,
      marketplace: a.marketplace,
      title: a.title,
      image_url: a.imageUrl,
      amount_cents: a.amountCents,
      units: a.units,
      orders: a.orders,
      rank: a.rank,
      synced_at: payload.syncedAt,
    }));
    const { error: upsertError } = await admin
      .from("desktop_earnings_top_asins")
      .upsert(rows, { onConflict: "user_id,period,asin" });
    if (upsertError) {
      if (isMissingTableError(upsertError)) return migrationPendingResponse();
      console.error("desktop/earnings-sync: top asins upsert failed", upsertError);
      return jsonWithCors({ error: "Could not save top ASINs" }, 500);
    }
    for (const period of payload.periods) {
      const asins = payload.topAsins.filter((a) => a.period === period).map((a) => a.asin);
      const { error: pruneError } = await admin
        .from("desktop_earnings_top_asins")
        .delete()
        .eq("user_id", userId)
        .eq("period", period)
        .not("asin", "in", pgList(asins));
      if (pruneError) {
        console.error("desktop/earnings-sync: top asins prune failed", pruneError, { period });
        return jsonWithCors({ error: "Could not replace top ASINs" }, 500);
      }
    }
  }

  // 3. Meta row (always written, even for an empty snapshot, so the dashboard
  // can say when the app last checked in).
  const { error: metaError } = await admin.from("desktop_earnings_sync_meta").upsert(
    {
      user_id: userId,
      last_synced_at: payload.syncedAt,
      app_version: payload.appVersion,
      currency: payload.currency,
      offsite_tracked: payload.offsiteTracked,
      months_count: payload.months.length,
      asins_count: payload.topAsins.length,
    },
    { onConflict: "user_id" },
  );
  if (metaError) {
    if (isMissingTableError(metaError)) return migrationPendingResponse();
    console.error("desktop/earnings-sync: meta upsert failed", metaError);
    return jsonWithCors({ error: "Could not save sync status" }, 500);
  }

  return jsonWithCors({ ok: true, months: payload.months.length, asins: payload.topAsins.length });
}
