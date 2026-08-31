/**
 * POST /api/admin/scheduling/create
 * Body: { email, name?, type:'support'|'demo', startMs, timezone?, topic?, joinUrl?, sendEmail?, force? }
 * Owner-side manual booking: drops a call onto the schedule without the customer
 * going through the front-end flow. Gated by scheduling.manage, audited.
 *
 * Slot rules (both behaviors supported):
 *  - force !== true : books via the book_call RPC, which rejects overlaps (slot_taken).
 *  - force === true : direct insert, skipping overlap + availability checks (admin override).
 *
 * No Google Meet room and no recording bot are created for a manual add (there is
 * no live meeting to join), so recording_status stays 'skipped_no_meet'. The
 * customer confirmation email is only sent when sendEmail is true.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { sendBookingConfirmation, type BookingEmailData } from "@/lib/call-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email?: string;
  name?: string;
  type?: string;
  startMs?: number;
  timezone?: string;
  topic?: string;
  joinUrl?: string;
  sendEmail?: boolean;
  force?: boolean;
};

export async function POST(request: Request) {
  const actor = await requirePermission("scheduling.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = (body.email || "").trim().slice(0, 200);
  if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid customer email is required." }, { status: 400 });

  const type = body.type === "support" || body.type === "demo" ? (body.type as CallTypeKey) : null;
  if (!type) return NextResponse.json({ error: "Bad type" }, { status: 400 });

  const startMs = Number(body.startMs);
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Bad time" }, { status: 400 });

  const ct = CALL_TYPES[type];
  const name = (body.name || "").trim().slice(0, 200) || null;
  const timezone = (body.timezone || "").trim().slice(0, 64) || null;
  const topic = (body.topic || "").trim().slice(0, 2000) || null;
  const joinUrl = (body.joinUrl || "").trim().slice(0, 500) || null;

  const startsAtISO = new Date(startMs).toISOString();
  const endMs = startMs + ct.blockMinutes * 60_000;
  const userEndMs = startMs + ct.userMinutes * 60_000;

  // Best-effort: link to an existing account by email so the prep sheet can show
  // their subscription + support history. Leaves user_id null if not found.
  let userId: string | null = null;
  try {
    const { data: prof } = await admin.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle();
    if (prof?.id) userId = prof.id as string;
  } catch (e) { console.error("[scheduling/create] user lookup", e); }

  let bookingId: string;

  if (body.force === true) {
    // Admin override: insert directly, no overlap/availability check.
    const { data, error } = await admin
      .from("call_bookings")
      .insert({
        user_id: userId,
        user_email: email,
        user_name: name,
        call_type: type,
        starts_at: startsAtISO,
        ends_at: new Date(endMs).toISOString(),
        user_ends_at: new Date(userEndMs).toISOString(),
        user_timezone: timezone,
        status: "confirmed",
        topic,
        join_url: joinUrl,
        meeting_provider: joinUrl ? "manual" : null,
        recording_status: "skipped_no_meet",
      })
      .select("id")
      .single();
    if (error || !data) { console.error("[scheduling/create] insert", error?.message); return NextResponse.json({ error: "Could not add that call." }, { status: 500 }); }
    bookingId = data.id as string;
  } else {
    // Respect existing bookings/blocks: the RPC rejects overlaps atomically.
    const { data, error } = await admin.rpc("book_call", {
      p_user_id: userId,
      p_user_email: email,
      p_user_name: name,
      p_call_type: type,
      p_starts_at: startsAtISO,
      p_ends_at: new Date(endMs).toISOString(),
      p_user_ends_at: new Date(userEndMs).toISOString(),
      p_user_timezone: timezone,
      p_topic: topic,
      p_join_url: joinUrl,
      p_meeting_provider: joinUrl ? "manual" : null,
      p_meeting_id: null,
    });
    if (error) {
      if (/slot_taken/.test(error.message || "")) {
        return NextResponse.json({ error: 'That time overlaps an existing call or block. Check "Force" to add it anyway.' }, { status: 409 });
      }
      console.error("[scheduling/create] rpc", error.message);
      return NextResponse.json({ error: "Could not add that call." }, { status: 500 });
    }
    bookingId = String(data);
  }

  // Optional customer confirmation. Best-effort: a mail failure never fails the add.
  if (body.sendEmail === true) {
    try {
      const emailData: BookingEmailData = {
        id: bookingId, callType: type, userEmail: email, userName: name,
        startMs, userEndMs, userTimezone: timezone, topic, joinUrl, recorded: false,
      };
      await sendBookingConfirmation(emailData);
    } catch (e) { console.error("[scheduling/create] confirm email", e); }
  }

  await logAdminAction({
    actor, action: "scheduling.create", targetType: "call_booking", targetId: bookingId,
    details: { email, call_type: type, starts_at: startsAtISO, force: body.force === true, emailed: body.sendEmail === true },
  });
  return NextResponse.json({ ok: true, id: bookingId });
}
