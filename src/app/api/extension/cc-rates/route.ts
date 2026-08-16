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
 * Response: { rates: { [asin]: { ratePct, brand, endsAt } } } - ASINs with no
 * active campaign rate are simply absent.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
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
  const { data, error } = await admin
    .from("extension_cc_rates")
    .select("asin, rate_pct, brand, ends_at")
    .in("asin", asins);

  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/cc-rates: read failed", error);
    return jsonWithCors({ error: "Could not load rates" }, 500);
  }

  const rates: Record<string, { ratePct: number; brand: string | null; endsAt: string | null }> =
    {};
  for (const row of data ?? []) {
    rates[row.asin as string] = {
      ratePct: Number(row.rate_pct),
      brand: (row.brand as string | null) ?? null,
      endsAt: (row.ends_at as string | null) ?? null,
    };
  }
  return jsonWithCors({ rates }, 200);
}
