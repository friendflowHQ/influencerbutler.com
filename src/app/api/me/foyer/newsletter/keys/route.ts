import { NextResponse } from "next/server";
import { requireMyLicenseKey } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/foyer/newsletter/keys
 * The signed-in creator's license keys (masked) with each key's active
 * subscriber count, plus which one is selected. Foyer data is stored per key,
 * so a creator with several keys can switch between their lists.
 */
export async function GET(request: Request) {
  const resolved = await requireMyLicenseKey(request);
  if ("response" in resolved) return resolved.response;

  return NextResponse.json({ ok: true, selectedId: resolved.keyId, keys: resolved.keys });
}
