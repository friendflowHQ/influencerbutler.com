import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/foyer/newsletter/subscribers/:id
 * One subscriber plus their full send history. Proxies to the links Worker's
 * GET /api/foyer/newsletter/subscribers/:id.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await requireMyLicenseKey();
  if ("response" in resolved) return resolved.response;

  const { id } = await context.params;
  const result = await callLinksWorkerAsUser(`/api/foyer/newsletter/subscribers/${encodeURIComponent(id)}`, resolved.licenseKey);
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}

/**
 * PATCH /api/me/foyer/newsletter/subscribers/:id  { tags?, status? }
 * Edit one subscriber's tags/status. Proxies to the links Worker's
 * PATCH /api/foyer/newsletter/subscribers/:id.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await requireMyLicenseKey();
  if ("response" in resolved) return resolved.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await callLinksWorkerAsUser(`/api/foyer/newsletter/subscribers/${encodeURIComponent(id)}`, resolved.licenseKey, {
    method: "PATCH",
    body,
  });
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}
