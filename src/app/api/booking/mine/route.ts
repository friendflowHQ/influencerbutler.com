/**
 * GET /api/booking/mine — the signed-in customer's own bookings (upcoming first).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/scheduling-server";

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
  return NextResponse.json({ bookings: data ?? [] });
}
