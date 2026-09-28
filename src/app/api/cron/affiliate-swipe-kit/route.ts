import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { runSwipeKitBroadcast, type SwipeKitDb } from "@/lib/affiliate-swipe-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual-trigger endpoint for the monthly affiliate swipe-kit broadcast. The
// automatic monthly send is driven by the affiliate-funnel cron (which calls the
// same runSwipeKitBroadcast with its once-per-month app_config guard), so this
// route needs no vercel.json entry - it exists so the owner can test or force a
// send by hitting it with the CRON_SECRET.

function serviceDb(): SwipeKitDb | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("swipe-kit: missing Supabase service-role configuration");
    return null;
  }
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  }) as unknown as SwipeKitDb;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("swipe-kit: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = serviceDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const result = await runSwipeKitBroadcast(db, new Date());
  return NextResponse.json(result);
}
