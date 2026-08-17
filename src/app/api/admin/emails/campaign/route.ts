/**
 * GET /api/admin/emails/campaign?id=<uuid>&page=
 *
 * One campaign in full detail for the admin drill-down drawer: the campaign
 * row (subject, body, audience, times, tag-on-send), its recipient list with
 * per-recipient status and sent time, and best-effort open/click/bounce
 * engagement joined from email_sends by category. Recipients are paged.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { campaignCategory } from "@/lib/email-marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const COUNT_PAGE = 1000;
const COUNT_CAP = 20000;
const ENGAGEMENT_CAP = 5000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecipientCounts = { queued: number; sent: number; skipped: number; failed: number };

type Engagement = {
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
};

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const pageRaw = Number(url.searchParams.get("page") ?? "0");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;

  const { data: campaign, error } = await db
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("admin emails/campaign: query failed", error);
    return NextResponse.json({ campaign: null, migrationPending: true });
  }
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Recipient page.
  const { data: recRows, count } = await db
    .from("email_campaign_recipients")
    .select("email, status, sent_at", { count: "exact" })
    .eq("campaign_id", id)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  const recipients = (recRows ?? []) as { email: string; status: string; sent_at: string | null }[];

  // Full counts across every recipient status.
  const counts: RecipientCounts = { queued: 0, sent: 0, skipped: 0, failed: 0 };
  for (let offset = 0; offset < COUNT_CAP; offset += COUNT_PAGE) {
    const { data: statusRows, error: statusErr } = await db
      .from("email_campaign_recipients")
      .select("status")
      .eq("campaign_id", id)
      .range(offset, offset + COUNT_PAGE - 1);
    if (statusErr) break;
    for (const row of statusRows ?? []) {
      if (typeof row.status === "string" && row.status in counts) {
        counts[row.status as keyof RecipientCounts] += 1;
      }
    }
    if ((statusRows ?? []).length < COUNT_PAGE) break;
  }

  // Best-effort engagement for the recipients on this page, from email_sends
  // by category. Empty until the Resend webhook populates events.
  const engagement = new Map<string, Engagement>();
  try {
    const { data: sendRows } = await db
      .from("email_sends")
      .select("recipient, delivered_at, opened_at, clicked_at, bounced_at")
      .eq("category", campaignCategory(id))
      .limit(ENGAGEMENT_CAP);
    for (const row of sendRows ?? []) {
      if (typeof row.recipient === "string") {
        engagement.set(row.recipient.toLowerCase(), {
          delivered_at: (row.delivered_at as string | null) ?? null,
          opened_at: (row.opened_at as string | null) ?? null,
          clicked_at: (row.clicked_at as string | null) ?? null,
          bounced_at: (row.bounced_at as string | null) ?? null,
        });
      }
    }
  } catch {
    // no engagement available; degrade to status-only
  }

  return NextResponse.json({
    campaign: { ...campaign, category: campaignCategory(id) },
    counts,
    recipients: recipients.map((r) => ({
      email: r.email,
      status: r.status,
      sent_at: r.sent_at,
      ...(engagement.get(r.email.toLowerCase()) ?? {
        delivered_at: null,
        opened_at: null,
        clicked_at: null,
        bounced_at: null,
      }),
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    migrationPending: false,
  });
}
