/**
 * GET /api/admin/support/get?id=fb-....
 * A single ticket with its full reply thread + persisted log tail. Proxies the
 * feedback Worker's /agent/tickets/:id behind the support.view permission.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { callSupportWorker } from "@/lib/support-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!FB_ID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const result = await callSupportWorker<{ ticket: unknown }>(`/agent/tickets/${encodeURIComponent(id)}`);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ticket: result.data.ticket });
}
