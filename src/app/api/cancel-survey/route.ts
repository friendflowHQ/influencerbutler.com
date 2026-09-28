/**
 * Public cancellation survey endpoint (no login).
 *
 * A survey_token minted by the subscription_cancelled webhook is the whole
 * authorization: it maps to exactly one pending subscription_cancel_reasons row.
 *
 *   GET  /api/cancel-survey?token=...   -> { ok, completed } (validate + status)
 *   POST /api/cancel-survey             -> records the answers, sets completed_at
 *
 * Uses the service-role client because the table's RLS only exposes a user's
 * own rows and this caller is unauthenticated.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeReason, normalizeWouldReturn } from "@/lib/cancel-reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = {
  token?: string;
  reason?: string;
  feedback?: string;
  intendedOutcome?: string;
  wouldReturn?: string;
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscription_cancel_reasons")
    .select("id,completed_at")
    .eq("survey_token", token)
    .maybeSingle();

  if (!data) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  return NextResponse.json({ ok: true, completed: Boolean(data.completed_at) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PostBody;
  const token = body.token?.toString().trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("subscription_cancel_reasons")
    .select("id,completed_at")
    .eq("survey_token", token)
    .maybeSingle();

  if (!row) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  if (row.completed_at) {
    // Already answered: treat as success so a double-submit reads as done.
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  const reason = normalizeReason(body.reason);
  const feedback = body.feedback?.toString().trim() || null;
  const intendedOutcome = body.intendedOutcome?.toString().trim() || null;
  const wouldReturn = normalizeWouldReturn(body.wouldReturn);

  const { error } = await supabase
    .from("subscription_cancel_reasons")
    .update({
      reason,
      feedback,
      intended_outcome: intendedOutcome,
      would_return: wouldReturn,
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    console.error("cancel-survey update failed", error);
    return NextResponse.json({ ok: false, error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
