/**
 * POST /api/extension/cc-rates  { asins: string[] }
 *
 * Real Creator Connections commission rates for a batch of ASINs, from the
 * daily extension_cc_rates build. Public (no auth), same reasoning as the
 * catalogue Bloom endpoint: campaign availability is not user data and the
 * extension asks anonymously. The extension caches results a day and only
 * asks about ASINs whose Bloom membership already says "in a campaign", so
 * batches stay tiny.
 *
 * Response: { rates: { [asin]: { ratePct, brand, endsAt, campaignId } } } -
 * ASINs with no active campaign rate are simply absent. `campaignId` is the
 * campaign the rate came from (null until migration 20260911 is applied and
 * the next build runs); the extension uses it to open that campaign for its
 * standalone Accept flow.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingColumnError,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ASINS = 50;
const ASIN_RE = /^[A-Z0-9]{10}$/;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  let body: { asins?: unknown };
  try {
    body = (await request.json()) as { asins?: unknown };
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  if (!Array.isArray(body.asins)) {
    return jsonWithCors({ error: "asins must be an array" }, 400);
  }
  const asins = Array.from(
    new Set(
      body.asins
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim().toUpperCase())
        .filter((a) => ASIN_RE.test(a)),
    ),
  ).slice(0, MAX_ASINS);
  if (asins.length === 0) {
    return jsonWithCors({ rates: {} }, 200);
  }

  const admin = createAdminClient();
  // campaign_id arrived with migration 20260911; a prod schema that lags it
  // answers with a missing-column error, so retry with the older column list
  // and serve campaignId: null rather than failing the whole lookup.
  let data: Record<string, unknown>[] | null = null;
  let error: { code?: string; message?: string } | null = null;
  const withId = await admin
    .from("extension_cc_rates")
    .select("asin, rate_pct, brand, ends_at, campaign_id")
    .in("asin", asins);
  data = withId.data;
  error = withId.error;
  if (error && isMissingColumnError(error)) {
    const withoutId = await admin
      .from("extension_cc_rates")
      .select("asin, rate_pct, brand, ends_at")
      .in("asin", asins);
    data = withoutId.data;
    error = withoutId.error;
  }

  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/cc-rates: read failed", error);
    return jsonWithCors({ error: "Could not load rates" }, 500);
  }

  const rates: Record<
    string,
    { ratePct: number; brand: string | null; endsAt: string | null; campaignId: string | null }
  > = {};
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    rates[row.asin as string] = {
      ratePct: Number(row.rate_pct),
      brand: (row.brand as string | null) ?? null,
      endsAt: (row.ends_at as string | null) ?? null,
      campaignId: typeof row.campaign_id === "string" && row.campaign_id ? row.campaign_id : null,
    };
  }
  return jsonWithCors({ rates }, 200);
}
