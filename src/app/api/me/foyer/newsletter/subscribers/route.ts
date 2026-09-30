import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/foyer/newsletter/subscribers?cursor=&search=&tag=&status=
 * Paged, searchable/tag-filterable list of the signed-in creator's own Foyer
 * newsletter subscribers. Proxies to the links Worker's
 * GET /api/foyer/newsletter/subscribers/list with a server-resolved Bearer key.
 */
export async function GET(request: Request) {
  const resolved = await requireMyLicenseKey();
  if ("response" in resolved) return resolved.response;

  const { search } = new URL(request.url);
  const result = await callLinksWorkerAsUser(`/api/foyer/newsletter/subscribers/list${search}`, resolved.licenseKey);
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}
