import { NextResponse } from "next/server";
import { requireMyLicenseKey, callLinksWorkerAsUser } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/foyer/sales/:id/refund { amountCents?, reason? }
 * The creator refunds one of their own Foyer payments (full or partial). The
 * links Worker checks the payment belongs to this license, refunds it on the
 * creator's Stripe account with our 5% returned, and emails the buyer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await requireMyLicenseKey(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await params;
  if (!/^led_[a-f0-9]{8,64}$/.test(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  let body: { amountCents?: unknown; reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const amountCents = body.amountCents === undefined || body.amountCents === null ? undefined : Math.round(Number(body.amountCents));
  if (amountCents !== undefined && (!Number.isFinite(amountCents) || amountCents <= 0)) {
    return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "";

  const result = await callLinksWorkerAsUser(`/api/commerce/sales/${encodeURIComponent(id)}/refund`, resolved.licenseKey, {
    method: "POST",
    body: { amountCents, reason },
  });
  return NextResponse.json(result.ok ? result.data : { ok: false, error: result.error }, { status: result.status });
}
