import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser, forwardQuery } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/foyer/sales?from&to&q&status&before
 * The signed-in creator's own Foyer sales (totals, chart series, payment list
 * with fees and refunds). Proxies to the links Worker's GET /api/commerce/sales
 * with a server-resolved Bearer key, so the list is scoped to their own sales.
 */
export async function GET(request: Request) {
  const resolved = await requireMyLicenseKey(request);
  if ("response" in resolved) return resolved.response;

  const result = await callLinksWorkerAsUser(`/api/commerce/sales${forwardQuery(request)}`, resolved.licenseKey);
  const body = result.ok ? { ...(result.data as object), keyId: resolved.keyId, keys: resolved.keys } : { ok: false, error: result.error };
  return NextResponse.json(body, { status: result.status });
}
