import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser, forwardQuery } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/foyer/newsletter/sends?cursor=
 * Past Foyer newsletter broadcasts + aggregate delivery/open/click stats for
 * the signed-in creator. Proxies to the links Worker's
 * GET /api/foyer/newsletter/sends.
 */
export async function GET(request: Request) {
  const resolved = await requireMyLicenseKey(request);
  if ("response" in resolved) return resolved.response;

  const result = await callLinksWorkerAsUser(`/api/foyer/newsletter/sends${forwardQuery(request)}`, resolved.licenseKey);
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}
