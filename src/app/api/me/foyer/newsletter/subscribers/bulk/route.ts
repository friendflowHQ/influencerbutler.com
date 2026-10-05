import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/foyer/newsletter/subscribers/bulk  { ids, action, tag? }
 * Bulk tag/untag/unsubscribe for the signed-in creator's own subscribers.
 * Proxies to the links Worker's POST /api/foyer/newsletter/subscribers/bulk.
 */
export async function POST(request: Request) {
  const resolved = await requireMyLicenseKey(request);
  if ("response" in resolved) return resolved.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const result = await callLinksWorkerAsUser("/api/foyer/newsletter/subscribers/bulk", resolved.licenseKey, {
    method: "POST",
    body,
  });
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}
