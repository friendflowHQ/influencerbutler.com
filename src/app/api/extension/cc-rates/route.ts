/**
 * POST /api/extension/cc-rates  { asins: string[] }
 *
 * Real Creator Connections commission rates for a batch of ASINs, answered by
 * the asin-lookup Worker (src/lib/asin-lookup.ts); Postgres holds no rate data.
 * Public (no auth), same reasoning as the catalogue Bloom endpoint: campaign
 * availability is not user data and the extension asks anonymously. The
 * extension caches results a day and only asks about ASINs whose Bloom
 * membership already says "in a campaign", so batches stay tiny.
 *
 * Response: { rates: { [asin]: { ratePct, brand, endsAt, campaignId } } } -
 * ASINs with no active campaign rate are simply absent. `campaignId` is the
 * campaign the rate came from; the extension uses it to open that campaign for
 * its standalone Accept flow.
 */
import { fetchCcRates } from "@/lib/asin-lookup";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

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

  try {
    const rates = await fetchCcRates(asins);
    return jsonWithCors({ rates }, 200);
  } catch (error) {
    // The extension treats a non-200 as "could not check" and asks again later.
    console.error("extension/cc-rates: lookup failed", error);
    return jsonWithCors({ error: "Could not load rates" }, 503);
  }
}
