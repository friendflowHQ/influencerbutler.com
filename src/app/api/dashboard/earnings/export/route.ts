/**
 * GET /api/dashboard/earnings/export?kind=months|asins - downloads the
 * signed-in user's synced earnings as CSV. Session cookie auth so a plain
 * <a href download> from /dashboard/earnings works. No entitlement gate (Free
 * tier feature, same as the page).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { csvResponse, toCsv, type CsvValue } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_HEADERS = [
  "month",
  "currency",
  "onsite_cents",
  "cc_cents",
  "offsite_cents",
  "brand_deal_cents",
  "international_cents",
  "bonus_cents",
  "total_cents",
] as const;

const ASIN_HEADERS = [
  "period",
  "rank",
  "asin",
  "marketplace",
  "title",
  "amount_cents",
  "units",
  "orders",
  "image_url",
] as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const userId = userData.user.id;

  const kind = new URL(request.url).searchParams.get("kind") === "asins" ? "asins" : "months";
  const today = new Date().toISOString().slice(0, 10);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("dashboard/earnings/export: service-role client unavailable", err);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  if (kind === "months") {
    const { data, error } = await admin
      .from("desktop_earnings_months")
      .select(MONTH_HEADERS.join(", "))
      .eq("user_id", userId)
      .order("month", { ascending: true })
      .limit(240);
    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ migrationPending: true });
      console.error("dashboard/earnings/export: months read failed", error);
      return NextResponse.json({ error: "Could not load earnings" }, { status: 500 });
    }
    const rows = ((data ?? []) as unknown as Record<string, CsvValue>[]).map((r) =>
      MONTH_HEADERS.map((h) => (h === "month" ? String(r.month ?? "").slice(0, 7) : r[h])),
    );
    return csvResponse(toCsv(MONTH_HEADERS, rows), `earnings-months-${today}.csv`);
  }

  const { data, error } = await admin
    .from("desktop_earnings_top_asins")
    .select(ASIN_HEADERS.join(", "))
    .eq("user_id", userId)
    .order("period", { ascending: true })
    .order("rank", { ascending: true })
    .limit(5000);
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ migrationPending: true });
    console.error("dashboard/earnings/export: asins read failed", error);
    return NextResponse.json({ error: "Could not load earnings" }, { status: 500 });
  }
  const rows = ((data ?? []) as unknown as Record<string, CsvValue>[]).map((r) =>
    ASIN_HEADERS.map((h) => r[h]),
  );
  return csvResponse(toCsv(ASIN_HEADERS, rows), `earnings-top-asins-${today}.csv`);
}
