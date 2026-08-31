/**
 * GET /api/admin/emails/sequence-step?sequenceId=<uuid>&position=<n>&page=&schedPage=
 *
 * Drill-down detail for one step of a custom drip sequence, powering the admin
 * SequenceStepDrawer:
 *   - step: the step's subject/body/day_offset (the copy that goes out).
 *   - sent: paginated per-recipient email_sends rows for this step (category
 *     seq_<id8>_s<position>), newest first, with open/click timestamps and the
 *     email_sends.id so a row can open the full SendDrawer timeline.
 *   - scheduled: open enrollments whose NEXT step is this one, each with a
 *     computed next_send_at (the "when will day 3 send" answer, per person).
 *
 * Reuses stepCategory + nextSendTime so timing here matches exactly what the
 * cron will do. Gated on reports.view; degrades with migrationPending like the
 * other admin emails routes.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { stepCategory, nextSendTime } from "@/lib/email-marketing";
import { isMissingTable } from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

type ScheduledRow = { email: string; enrolled_at: string; next_send_at: string | null };

function pageParam(url: URL, key: string): number {
  const raw = Number(url.searchParams.get(key) ?? "0");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const sequenceId = (url.searchParams.get("sequenceId") ?? "").trim();
  const position = Number(url.searchParams.get("position") ?? "");
  if (!UUID_RE.test(sequenceId)) {
    return NextResponse.json({ error: "Invalid sequenceId" }, { status: 400 });
  }
  if (!Number.isInteger(position) || position < 1) {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }
  const sentPage = pageParam(url, "page");
  const schedPage = pageParam(url, "schedPage");

  // Sequence (for send_hour) + this step's copy.
  const { data: seq, error: seqErr } = await db
    .from("email_sequences")
    .select("id, name, send_hour")
    .eq("id", sequenceId)
    .maybeSingle();
  if (seqErr) {
    if (isMissingTable(seqErr)) {
      return NextResponse.json({ migrationPending: true }, { status: 200 });
    }
    console.error("admin emails/sequence-step: sequence lookup failed", seqErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!seq) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  // send_hour column may not be applied yet; treat as null (enrollment-minute).
  const sendHour = typeof seq.send_hour === "number" ? seq.send_hour : null;

  const { data: step, error: stepErr } = await db
    .from("email_sequence_steps")
    .select("id, position, day_offset, subject, body")
    .eq("sequence_id", sequenceId)
    .eq("position", position)
    .maybeSingle();
  if (stepErr) {
    console.error("admin emails/sequence-step: step lookup failed", stepErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  // Sent recipients for this step, newest first.
  const category = stepCategory(sequenceId, position);
  const {
    data: sentRows,
    error: sentErr,
    count: sentCount,
  } = await db
    .from("email_sends")
    .select("id, recipient, status, delivered_at, opened_at, clicked_at, bounced_at, created_at", {
      count: "exact",
    })
    .eq("category", category)
    .order("created_at", { ascending: false })
    .range(sentPage * PAGE_SIZE, sentPage * PAGE_SIZE + PAGE_SIZE - 1);
  if (sentErr) console.error("admin emails/sequence-step: sends query failed", sentErr);

  // Open enrollments whose next step IS this one: last_step_sent = position - 1.
  const {
    data: schedData,
    error: schedErr,
    count: schedCount,
  } = await db
    .from("email_sequence_enrollments")
    .select("email, enrolled_at", { count: "exact" })
    .eq("sequence_id", sequenceId)
    .eq("last_step_sent", position - 1)
    .is("completed_at", null)
    .is("cancelled_at", null)
    .order("enrolled_at", { ascending: true })
    .range(schedPage * PAGE_SIZE, schedPage * PAGE_SIZE + PAGE_SIZE - 1);
  if (schedErr) console.error("admin emails/sequence-step: enrollments query failed", schedErr);

  const scheduled: ScheduledRow[] = (schedData ?? []).map((row) => {
    const at = nextSendTime(row.enrolled_at as string, step.day_offset, sendHour);
    return {
      email: row.email as string,
      enrolled_at: row.enrolled_at as string,
      next_send_at: Number.isFinite(at) ? new Date(at).toISOString() : null,
    };
  });

  return NextResponse.json({
    step: { position: step.position, day_offset: step.day_offset, subject: step.subject, body: step.body },
    sendHour,
    sequenceName: typeof seq.name === "string" ? seq.name : "",
    sent: {
      rows: sentRows ?? [],
      total: sentCount ?? 0,
      page: sentPage,
      pageSize: PAGE_SIZE,
    },
    scheduled: {
      rows: scheduled,
      total: schedCount ?? 0,
      page: schedPage,
      pageSize: PAGE_SIZE,
    },
    migrationPending: false,
  });
}
