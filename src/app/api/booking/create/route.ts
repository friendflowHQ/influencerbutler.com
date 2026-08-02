/**
 * POST /api/booking/create
 * Body: { type:'support'|'demo', startMs:number, timezone?:string, topic?:string, name?:string }
 * Gates support to subscribers, re-validates the slot, mints a Zoom meeting
 * (or falls back to the configured link), books atomically via the book_call
 * RPC, and sends the confirmation (+.ics) + owner notification emails.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, validateSlot, loadConfig } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { tierForSubscriptionStatus } from "@/lib/entitlements";
import { createZoomMeeting, isZoomConfigured } from "@/lib/zoom";
import { sendBookingConfirmation, sendOwnerNotification, type BookingEmailData } from "@/lib/call-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { type?: string; startMs?: number; timezone?: string; topic?: string; name?: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const type = body.type === "support" || body.type === "demo" ? (body.type as CallTypeKey) : null;
  if (!type) return NextResponse.json({ error: "Bad type" }, { status: 400 });
  const startMs = Number(body.startMs);
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Bad time" }, { status: 400 });
  const ct = CALL_TYPES[type];

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Gate: support calls require an active/trial subscription.
  if (ct.requiresSubscription) {
    const { data: sub } = await admin
      .from("subscriptions").select("status").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const tier = tierForSubscriptionStatus((sub?.status as string) ?? null);
    if (tier === "free") {
      return NextResponse.json({ error: "Support calls are for subscribers. Start a plan (no credit card required) to book one, or book a free demo call instead." }, { status: 403 });
    }
  }

  const v = await validateSlot(admin, type, startMs, Date.now());
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 409 });

  // Video link: Zoom if configured, else the fallback link.
  let joinUrl: string | null = null;
  let provider: string | null = null;
  let meetingId: string | null = null;
  if (isZoomConfigured()) {
    const z = await createZoomMeeting({ topic: `${ct.label}: ${user.email}`, startMs, minutes: ct.userMinutes });
    if (z) { joinUrl = z.joinUrl; provider = "zoom"; meetingId = z.meetingId; }
  }
  if (!joinUrl) {
    const cfg = await loadConfig(admin);
    if (cfg.defaultJoinUrl) { joinUrl = cfg.defaultJoinUrl; provider = "manual"; }
  }

  const topic = (body.topic || "").trim().slice(0, 2000);
  const name = (body.name || "").trim().slice(0, 200) || null;
  const timezone = (body.timezone || "").trim().slice(0, 64) || null;

  const { data: bookingId, error } = await admin.rpc("book_call", {
    p_user_id: user.id,
    p_user_email: user.email,
    p_user_name: name,
    p_call_type: type,
    p_starts_at: new Date(startMs).toISOString(),
    p_ends_at: new Date(v.endMs).toISOString(),
    p_user_ends_at: new Date(v.userEndMs).toISOString(),
    p_user_timezone: timezone,
    p_topic: topic || null,
    p_join_url: joinUrl,
    p_meeting_provider: provider,
    p_meeting_id: meetingId,
  });

  if (error) {
    if (/slot_taken/.test(error.message || "")) {
      return NextResponse.json({ error: "That time was just taken. Please pick another." }, { status: 409 });
    }
    console.error("[booking/create] rpc", error.message);
    return NextResponse.json({ error: "Could not book that time." }, { status: 500 });
  }

  const emailData: BookingEmailData = {
    id: String(bookingId),
    callType: type,
    userEmail: user.email,
    userName: name,
    startMs,
    userEndMs: v.userEndMs,
    userTimezone: timezone,
    topic: topic || null,
    joinUrl,
  };
  // Best-effort: a failed email must not fail a confirmed booking.
  try { await sendBookingConfirmation(emailData); } catch (e) { console.error("[booking] confirm email", e); }
  try {
    const { data: sub } = await admin.from("subscriptions").select("status,plan_name").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const tier = tierForSubscriptionStatus((sub?.status as string) ?? null);
    await sendOwnerNotification(emailData, `Subscription: ${tier}${sub?.plan_name ? ` (${sub.plan_name})` : ""}.`);
  } catch (e) { console.error("[booking] owner email", e); }

  return NextResponse.json({ ok: true, id: bookingId, joinUrl });
}
