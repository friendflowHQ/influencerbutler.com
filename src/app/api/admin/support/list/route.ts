/**
 * GET /api/admin/support/list
 *   ?statuses=sent,escalated&classification=bug&tier=growth&priority=P0&q=crash&since=<ms>&limit=50&offset=0
 *
 * Proxies the feedback Worker's /agent/inbox (rich filters) behind the
 * support.view permission. The SUPPORT_BOT_TOKEN bearer lives server-side only.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { callSupportWorker } from "@/lib/support-worker";
import { getTicketMeta } from "@/lib/support-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_THROUGH = ["statuses", "classification", "tier", "priority", "q", "since", "limit", "offset"] as const;

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const src = new URL(request.url).searchParams;
  const qs = new URLSearchParams();
  for (const key of PASS_THROUGH) {
    const v = src.get(key);
    if (v != null && v !== "") qs.set(key, v);
  }
  // Default to the newest 50 across all statuses when no filter is given.
  if (!qs.has("limit")) qs.set("limit", "50");

  const result = await callSupportWorker<{ tickets: unknown[] }>(`/agent/inbox?${qs.toString()}`);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Attach the human-side data (assignee, note count, pending bot draft). Best
  // effort: before the Supabase migration runs this just returns nothing extra.
  const tickets = (result.data.tickets ?? []) as { id?: string }[];
  const ids = tickets.map((t) => t.id).filter((x): x is string => typeof x === "string");
  const { meta, pending } = await getTicketMeta(ids);
  const enriched = tickets.map((t) => {
    const m = t.id ? meta[t.id] : undefined;
    return m ? { ...t, assignee: m.assignee, noteCount: m.noteCount, draftId: m.draftId } : t;
  });

  return NextResponse.json({ admin: { email: actor.email }, tickets: enriched, metaPending: pending });
}
