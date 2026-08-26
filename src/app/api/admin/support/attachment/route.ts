/**
 * GET /api/admin/support/attachment?id=<n>
 * Streams a stored inbound-email attachment (screenshot / file) from the
 * feedback Worker's bearer-gated /agent/attachments/:id route, behind the
 * support.view permission. The R2 bucket stays private; the browser only ever
 * talks to this same-origin proxy, which holds the SUPPORT_BOT_TOKEN bearer.
 * Used as the src for inline <img> and the href for download links in the
 * admin Support dashboard.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { fetchSupportWorkerRaw } from "@/lib/support-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const res = await fetchSupportWorkerRaw(`/agent/attachments/${id}`);
  if (!res) return NextResponse.json({ error: "Support worker unreachable" }, { status: 502 });
  if (!res.ok) {
    // Upstream JSON error (404 / 401 / 500) - surface the status, drop the body.
    return NextResponse.json({ error: `Attachment fetch failed (${res.status})` }, { status: res.status });
  }

  const headers = new Headers();
  headers.set("content-type", res.headers.get("content-type") || "application/octet-stream");
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  const length = res.headers.get("content-length");
  if (length) headers.set("content-length", length);
  // Private: admin-only content, never shared caches.
  headers.set("cache-control", "private, max-age=300");

  return new NextResponse(res.body, { status: 200, headers });
}
