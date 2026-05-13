import { NextResponse } from "next/server";
import { PRICING_TIERS } from "@/lib/mcp/feature-catalog";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    { tiers: PRICING_TIERS },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
