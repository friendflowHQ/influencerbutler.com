/**
 * GET /api/admin/scheduling/prep?bookingId=...
 * The call prep sheet: the booking, the customer's subscription, their prior
 * calls, and their support history (with "what Claude fixed"). scheduling.view.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";
import { callSupportWorker } from "@/lib/support-worker";
import { getStatusBadge } from "@/lib/subscription-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ticket = {
  id: string; title: string; status: string; priority: string; classification: string | null;
  agentNotes: string; fixCommitSha: string | null; resolvedVersion: string | null;
  submittedAt: number | null; userEmail: string;
};

export async function GET(request: Request) {
  const actor = await requirePermission("scheduling.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bookingId = (new URL(request.url).searchParams.get("bookingId") || "").trim();
  if (!bookingId) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: booking, error } = await admin
    .from("call_bookings")
    .select("id,user_id,user_email,user_name,call_type,starts_at,user_ends_at,user_timezone,status,topic,join_url,host_notes")
    .eq("id", bookingId).maybeSingle();
  if (error || !booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const email = booking.user_email as string;

  // Subscription + profile (best-effort).
  let subscription: { status: string | null; plan_name: string | null; renews_at: string | null; ends_at: string | null; badge: ReturnType<typeof getStatusBadge> } | null = null;
  let displayName: string | null = null;
  if (booking.user_id) {
    const { data: sub } = await admin.from("subscriptions").select("status,plan_name,renews_at,ends_at").eq("user_id", booking.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sub) subscription = { status: sub.status ?? null, plan_name: sub.plan_name ?? null, renews_at: sub.renews_at ?? null, ends_at: sub.ends_at ?? null, badge: getStatusBadge(sub.status ?? null) };
    const { data: prof } = await admin.from("profiles").select("display_name").eq("id", booking.user_id).maybeSingle();
    displayName = prof?.display_name ?? null;
  }

  // Prior calls with this customer.
  const { data: priorCalls } = await admin
    .from("call_bookings").select("id,call_type,starts_at,status,topic")
    .eq("user_email", email).neq("id", bookingId).order("starts_at", { ascending: false }).limit(20);

  // Support history from the feedback Worker (fuzzy q over user_email).
  let tickets: Ticket[] = [];
  const res = await callSupportWorker<{ tickets: Ticket[] }>(`/agent/inbox?q=${encodeURIComponent(email)}&limit=100`);
  if (res.ok) tickets = (res.data.tickets || []).filter((t) => (t.userEmail || "").toLowerCase() === email.toLowerCase());

  const fixed = tickets.filter((t) => t.fixCommitSha || t.resolvedVersion || t.status === "fixed");

  return NextResponse.json({
    booking,
    displayName,
    subscription,
    priorCalls: priorCalls ?? [],
    support: {
      total: tickets.length,
      open: tickets.filter((t) => !["fixed", "spam", "archived"].includes(t.status)).length,
      tickets: tickets.slice(0, 30),
      fixedHighlights: fixed.slice(0, 10).map((t) => ({
        id: t.id, title: t.title, resolvedVersion: t.resolvedVersion, fixCommitSha: t.fixCommitSha,
        note: (t.agentNotes || "").slice(0, 400),
      })),
    },
  });
}
