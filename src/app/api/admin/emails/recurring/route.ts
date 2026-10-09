/**
 * GET   /api/admin/emails/recurring   state of the recurring Group Mirror series
 * PATCH /api/admin/emails/recurring   { enabled: boolean }  turn it on or off
 *
 * Backs the on/off card in the admin Campaigns tab. The series itself runs from
 * the email-marketing cron (src/lib/recurring-campaign.ts).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PRICING_NOTE_ENDS_AT,
  RECURRING_EVERY_DAYS,
  RECURRING_MAX_PER_RUN,
  RECURRING_MIN_TO_SEND,
  readRecurringState,
  setRecurringEnabled,
} from "@/lib/recurring-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function payload(state: Awaited<ReturnType<typeof readRecurringState>>) {
  return {
    enabled: state.enabled,
    nextRunAt: state.nextRunAt,
    lastRunAt: state.lastRunAt,
    lastCampaignId: state.lastCampaignId,
    history: state.history,
    everyDays: RECURRING_EVERY_DAYS,
    maxPerRun: RECURRING_MAX_PER_RUN,
    minToSend: RECURRING_MIN_TO_SEND,
    pricingNoteEndsAt: PRICING_NOTE_ENDS_AT,
  };
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  return NextResponse.json(payload(await readRecurringState(db)));
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
  }

  const next = await setRecurringEnabled(db, body.enabled, actor.email);
  if (!next) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json(payload(next));
}
