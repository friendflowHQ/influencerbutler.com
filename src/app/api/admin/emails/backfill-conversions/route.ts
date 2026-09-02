/**
 * One-shot backfill for per-step sequence conversion tracking.
 *
 * The cron records conversions going forward (stamping converted_at /
 * converted_step when an enrolled address becomes a live subscriber), but
 * enrollments that converted BEFORE the 20260906 migration have no record. This
 * endpoint walks existing enrollments and, for anyone whose address is a live
 * subscriber today, stamps converted_at = now() and converted_step =
 * last_step_sent (last-touch), also cancelling any still-open enrollment so the
 * active backlog matches - exactly what the cron's stop-on-subscribe pass does.
 *
 * Scope matches the cron: only sequences that participate in stop-on-subscribe
 * (every sequence except the review-ask drip, whose conversion is a review click,
 * not a subscription). Idempotent and resumable via a keyset cursor over
 * enrollment id, so it is safe to call repeatedly until { done: true }.
 *
 * POST /api/admin/emails/backfill-conversions   body: { cursor?: string }
 *   -> { ok, scanned, updated, nextCursor, done, migrationPending? }
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveSubscriberEmails } from "@/lib/email-audience";
import { EXT_REVIEW_TAG } from "@/lib/extension-review";
import { isMissingTable } from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 500;
const MAX_PAGES = 20; // up to 10k enrollments scanned per call, then resume.

type EnrollmentRow = {
  id: string;
  sequence_id: string;
  email: string;
  last_step_sent: number | null;
  cancelled_at: string | null;
};

/** True when a write failed only because the 20260906 columns are not applied. */
function isMissingConvColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return /converted_at|converted_step/i.test(msg) && /column|schema cache/i.test(msg);
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let body: { cursor?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Empty body is fine: start from the beginning.
  }
  let cursor = typeof body.cursor === "string" ? body.cursor : "";

  // Which sequences participate in stop-on-subscribe (all but the review drip).
  const { data: seqData, error: seqErr } = await db
    .from("email_sequences")
    .select("id, trigger");
  if (seqErr) {
    if (isMissingTable(seqErr)) {
      return NextResponse.json({ ok: false, migrationPending: true });
    }
    return NextResponse.json({ error: "Sequence lookup failed" }, { status: 500 });
  }
  const stopIds = (seqData ?? [])
    .filter((s) => {
      const trig = (s.trigger ?? null) as { kind?: string; tag?: string } | null;
      return !(trig?.kind === "tag_added" && trig.tag === EXT_REVIEW_TAG);
    })
    .map((s) => s.id as string);
  if (stopIds.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, updated: 0, nextCursor: "", done: true });
  }

  const live = await liveSubscriberEmails(db);
  if (!live) {
    return NextResponse.json({ error: "Could not load live subscribers" }, { status: 500 });
  }

  let scanned = 0;
  let updated = 0;
  let done = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db
      .from("email_sequence_enrollments")
      .select("id, sequence_id, email, last_step_sent, cancelled_at")
      .is("converted_at", null)
      .in("sequence_id", stopIds)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (cursor) q = q.gt("id", cursor);

    const { data, error } = await q;
    if (error) {
      if (isMissingConvColumn(error)) {
        return NextResponse.json({ ok: false, migrationPending: true });
      }
      return NextResponse.json({ error: "Enrollment scan failed" }, { status: 500 });
    }

    const rows = (data ?? []) as EnrollmentRow[];
    if (rows.length === 0) {
      done = true;
      break;
    }

    const now = new Date().toISOString();
    for (const row of rows) {
      scanned += 1;
      cursor = row.id;
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (!email || !live.has(email)) continue;
      const { error: upErr } = await db
        .from("email_sequence_enrollments")
        .update({
          converted_at: now,
          converted_step: row.last_step_sent ?? 0,
          // Converted people leave the active backlog, same as the cron does.
          cancelled_at: row.cancelled_at ?? now,
        })
        .eq("id", row.id);
      if (!upErr) updated += 1;
    }

    if (rows.length < PAGE) {
      done = true;
      break;
    }
  }

  return NextResponse.json({ ok: true, scanned, updated, nextCursor: cursor, done });
}
