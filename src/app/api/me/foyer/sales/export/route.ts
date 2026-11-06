import { NextResponse } from "next/server";
import { requireMyLicenseKey, forwardQuery } from "@/lib/links-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WORKER_URL = "https://links.influencerbutler.com";

/**
 * GET /api/me/foyer/sales/export?from&to&q&status
 * Streams the creator's Foyer sales as a CSV download (date, buyer, item,
 * amount, Stripe fee, our fee, what they earned, refunded).
 */
export async function GET(request: Request) {
  const resolved = await requireMyLicenseKey(request);
  if ("response" in resolved) return resolved.response;
  const base = (process.env.LINKS_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/commerce/sales/export.csv${forwardQuery(request)}`, {
      headers: { authorization: `Bearer ${resolved.licenseKey}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Links worker unreachable" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ ok: false, error: `Export failed (${res.status})` }, { status: res.status });
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": res.headers.get("content-disposition") || 'attachment; filename="foyer-sales.csv"',
      "cache-control": "private, no-store",
    },
  });
}
