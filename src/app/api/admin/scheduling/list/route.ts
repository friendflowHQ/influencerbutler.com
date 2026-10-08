/**
 * GET /api/admin/scheduling/list?scope=upcoming|past|all
 * GET /api/admin/scheduling/list?from=<ISO>&to=<ISO>
 * Add &enrich=1 (Cards view) to attach each booking's plan + prior-call count as `ctx`.
 * Bookings for the owner console. Gated by scheduling.view. The from/to form
 * (used by the week/month calendar views) returns every booking starting in
 * that exact window, uncapped by the 200-row scope limit below, so navigating
 * the calendar to an older or farther-out period isn't silently truncated.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";
import { isMissingTopicsColumn } from "@/lib/call-topics";
import { tierForSubscriptionStatus } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_COLS = "id,user_id,user_email,user_name,call_type,starts_at,ends_at,user_ends_at,user_timezone,status,topic,join_url,meeting_provider,host_notes,created_at,recording_status";

type Row = Record<string, unknown> & { id: string; user_id: string | null; user_email: string; starts_at: string };

export async function GET(request: Request) {
  const actor = await requirePermission("scheduling.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const scope = params.get("scope") || "upcoming";
  const enrich = params.get("enrich") === "1";
  const nowIso = new Date().toISOString();

  const build = (cols: string) => {
    let q = admin.from("call_bookings").select(cols);
    let limit = 200;
    if (from && to) {
      // Calendar grid request: an exact, bounded window, so raise the cap well
      // past anything a single week or month could plausibly hold.
      q = q.gte("starts_at", from).lt("starts_at", to).order("starts_at", { ascending: true });
      limit = 1000;
    } else if (scope === "upcoming") {
      // Split upcoming/past by the call's END time, not its start, so a call that has
      // begun but is not over yet stays under "upcoming". Rows with a null ends_at
      // (legacy inserts) are treated as not-yet-past and kept in "upcoming".
      // Terminal statuses drop out of "upcoming" regardless of time: a call marked
      // done, no-show, or cancelled is resolved, so it should not linger just because
      // its scheduled time is still in the future (it stays visible under All/Past).
      q = q.or(`ends_at.gte.${nowIso},ends_at.is.null`).not("status", "in", "(cancelled,completed,no_show)").order("starts_at", { ascending: true });
    } else if (scope === "past") q = q.lt("ends_at", nowIso).order("starts_at", { ascending: false });
    else q = q.order("starts_at", { ascending: false });
    return q.limit(limit);
  };

  // Prod migrations are applied by hand: if the topics column is not there yet,
  // fall back to the pre-chips column set instead of failing the whole list.
  let res = await build(`${BASE_COLS},topics`);
  if (res.error && isMissingTopicsColumn(res.error)) res = await build(BASE_COLS);
  const { data, error } = res;
  if (error) {
    // Surface the underlying Postgres error to the (admin-gated) caller. This is
    // how prod schema drift shows up here: a missing column makes the whole list
    // fail, and a generic message hides which column, so name it explicitly.
    console.error("scheduling/list query failed", error);
    return NextResponse.json({ error: "Query failed", detail: error.message, code: error.code }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Row[];
  if (!enrich || rows.length === 0) return NextResponse.json({ bookings: rows });

  // Cards view context: the customer's plan and how many calls they have had
  // before this one. Best-effort, so a failure here never hides the calls.
  try {
    const emails = Array.from(new Set(rows.map((r) => r.user_email.toLowerCase())));
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v)));
    const [hist, subs] = await Promise.all([
      admin.from("call_bookings").select("user_email,starts_at,status").in("user_email", emails).in("status", ["completed", "no_show"]).limit(3000),
      userIds.length
        ? admin.from("subscriptions").select("user_id,status,plan_name,created_at").in("user_id", userIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as { user_id: string; status: string | null; plan_name: string | null }[] }),
    ]);
    const past = (hist.data ?? []) as { user_email: string; starts_at: string; status: string }[];
    const planByUser = new Map<string, { tier: string; planName: string | null }>();
    for (const s of (subs.data ?? []) as { user_id: string; status: string | null; plan_name: string | null }[]) {
      if (!planByUser.has(s.user_id)) planByUser.set(s.user_id, { tier: tierForSubscriptionStatus(s.status), planName: s.plan_name ?? null });
    }
    for (const r of rows) {
      const email = r.user_email.toLowerCase();
      const priorCalls = past.filter((p) => p.user_email.toLowerCase() === email && p.starts_at < r.starts_at).length;
      const plan = r.user_id ? planByUser.get(r.user_id) ?? { tier: "free", planName: null } : null;
      r.ctx = { priorCalls, plan };
    }
  } catch (e) { console.error("scheduling/list enrich", e); }
  return NextResponse.json({ bookings: rows });
}
