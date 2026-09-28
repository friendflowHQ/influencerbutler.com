/**
 * POST /api/events/cancel
 * Body: { eventId: string }
 * Cancels the signed-in user's registration for an event (stamps cancelled_at).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { eventId?: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = (body.eventId || "").trim();
  if (!eventId) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { error } = await admin
    .from("event_registrations")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("user_email", user.email);
  if (error) {
    console.error("[events/cancel] update", error.message);
    return NextResponse.json({ error: "Could not cancel." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
