import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/foyer/newsletter/sends/:id/recipients
 * Per-recipient delivery/open/click drill-down for one send. Proxies to the
 * links Worker's GET /api/foyer/newsletter/sends/:id/recipients.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await requireMyLicenseKey();
  if ("response" in resolved) return resolved.response;

  const { id } = await context.params;
  const result = await callLinksWorkerAsUser(`/api/foyer/newsletter/sends/${encodeURIComponent(id)}/recipients`, resolved.licenseKey);
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}
