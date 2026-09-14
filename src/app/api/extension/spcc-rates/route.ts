/**
 * POST /api/extension/spcc-rates  { asins: string[] }
 *
 * Amazon's own "Earn on Clicks" (SPCC) forecast for a batch of ASINs, from the
 * daily extension_spcc_rates build. Public (no auth), same reasoning as the
 * cc-rates endpoint: campaign availability is not user data and the extension
 * asks anonymously. The extension caches results a day and only asks about
 * ASINs whose Bloom membership already says "in an SPCC campaign", so batches
 * stay tiny.
 *
 * Response: { rates: { [asin]: { epc, budgetAvailability, brand } } } - ASINs
 * with no SPCC row are simply absent. `epc` is Amazon's forecast $/click, NOT
 * the creator's realized earnings (see CampaignStatusRecord.epc for that).
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
  const { data, error } = await admin
    .from("extension_spcc_rates")
    .select("asin, estimated_epc, budget_availability, brand")
    .in("asin", asins);

  if (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) return migrationPendingResponse();
    console.error("extension/spcc-rates: read failed", error);
    return jsonWithCors({ error: "Could not load rates" }, 500);
  }

  const rates: Record<
    string,
    { epc: number; budgetAvailability: string | null; brand: string | null }
  > = {};
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    rates[row.asin as string] = {
      epc: Number(row.estimated_epc),
      budgetAvailability: (row.budget_availability as string | null) ?? null,
      brand: (row.brand as string | null) ?? null,
    };
  }
  return jsonWithCors({ rates }, 200);
}
