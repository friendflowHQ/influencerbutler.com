/**
 * GET /api/extension/rate-card?marketplace=amazon.com
 *
 * Serves the normalized Amazon Associates commission-rate schedule to the
 * extension. Public (no auth): commission rates are not user data. Read from
 * R2 and heavily edge-cached, keyed by version via ETag, so the object is
 * fetched roughly once per publish, not per request. The extension downloads
 * it once a day and looks up a product's category locally. Soft-fails with
 * { notBuilt: true } until the rate card is published to the central feed.
 */
import { NextResponse } from "next/server";
import { readRateCard } from "@/lib/rate-card";
import { corsHeaders, jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const marketplace = new URL(request.url).searchParams.get("marketplace") || "amazon.com";

  let card;
  try {
    card = await readRateCard(marketplace);
  } catch (error) {
    console.error("extension/rate-card: read failed", error);
    return jsonWithCors({ error: "Could not load rate card" }, 500);
  }
  if (!card) {
    return jsonWithCors({ notBuilt: true }, 200);
  }

  const etag = `"rate-${card.marketplace}-${card.version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...corsHeaders(), ETag: etag } });
  }

  return NextResponse.json(card, {
    status: 200,
    headers: {
      ...corsHeaders(),
      ETag: etag,
      // Edge-cache for a day; serve stale briefly while revalidating.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
