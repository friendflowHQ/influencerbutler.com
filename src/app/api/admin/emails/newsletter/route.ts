/**
 * GET /api/admin/emails/newsletter
 *
 * Per-issue newsletter stats. Issues come from the newsletter scheduler state
 * (app_config 'newsletter_schedule', which records each sent Resend broadcast
 * id); per-recipient rows come from email_sends, inserted by the Resend
 * webhook as broadcast events arrive. Issues sent before broadcast ids were
 * recorded have no stats here: those live only in the Resend dashboard.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readNewsletterState, NEWSLETTER_ISSUES } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IssueStats = {
  index: number;
  subject: string;
  sentAt: string;
  broadcastId: string;
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const state = await readNewsletterState();

  const issues: IssueStats[] = [];
  for (const b of state.broadcasts) {
    const stats: IssueStats = {
      index: b.index,
      subject: b.subject,
      sentAt: b.sentAt,
      broadcastId: b.id,
      recipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    };
    const { data, error } = await db
      .from("email_sends")
      .select("delivered_at, opened_at, clicked_at, bounced_at")
      .eq("broadcast_id", b.id)
      .limit(10000);
    if (!error && data) {
      stats.recipients = data.length;
      for (const row of data as {
        delivered_at: string | null;
        opened_at: string | null;
        clicked_at: string | null;
        bounced_at: string | null;
      }[]) {
        if (row.delivered_at) stats.delivered += 1;
        if (row.opened_at) stats.opened += 1;
        if (row.clicked_at) stats.clicked += 1;
        if (row.bounced_at) stats.bounced += 1;
      }
    }
    issues.push(stats);
  }
  issues.sort((a, b) => b.index - a.index);

  return NextResponse.json({
    enabled: state.enabled,
    lastSentIndex: state.lastSentIndex,
    lastSentAt: state.lastSentAt,
    totalIssues: NEWSLETTER_ISSUES.length,
    // Issues sent before broadcast ids were persisted (index <= lastSentIndex
    // but absent from broadcasts) are only visible in the Resend dashboard.
    untrackedSentIssues: Math.max(0, state.lastSentIndex + 1 - state.broadcasts.length),
    issues,
  });
}
