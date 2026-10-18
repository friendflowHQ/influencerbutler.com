/**
 * GET /api/extension/target-rate-card
 *
 * Serves Target's estimated affiliate commission schedule to the extension in
 * the same shape as /api/extension/rate-card. Public (no auth): commission rates
 * are not user data. A static in-code table, so this route is always available
 * and never soft-fails. Edge-cached and keyed by version via ETag.
 */
import { NextResponse } from "next/server";
import { buildTargetRateCard } from "@/lib/target-rate-card";
import { corsHeaders, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const card = buildTargetRateCard();

  const etag = `"rate-${card.marketplace}-${card.version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...corsHeaders(), ETag: etag } });
  }

  return NextResponse.json(card, {
    status: 200,
    headers: {
      ...corsHeaders(),
      ETag: etag,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
