/**
 * GET /api/booking/mine — the signed-in customer's own bookings (upcoming first).
 * Each row carries a signed manage_url (reschedule or cancel without a second login).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/scheduling-server";
import { manageUrl } from "@/lib/call-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await admin
    .from("call_bookings")
    .select("id,call_type,starts_at,user_ends_at,user_timezone,status,topic,join_url")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });
  const bookings = (data ?? []).map((b) => ({ ...b, manage_url: b.status === "confirmed" ? manageUrl(b.id as string) : null }));
  return NextResponse.json({ bookings });
}
