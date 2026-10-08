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
import { extractSrcTags } from "@/lib/campaign-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const COUNT_PAGE = 1000;
const COUNT_CAP = 20000;
const ENGAGEMENT_CAP = 20000;

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
    // Page in 1000-row ranges with a stable order: a single .limit(5000) is
    // silently capped at 1000 rows by PostgREST and returns an arbitrary subset,
    // which made opens and clicks flicker between loads.
    for (let offset = 0; offset < ENGAGEMENT_CAP; offset += COUNT_PAGE) {
      const { data: sendRows, error: sendErr } = await db
        .from("email_sends")
        .select("recipient, delivered_at, opened_at, clicked_at, bounced_at")
        .eq("category", campaignCategory(id))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + COUNT_PAGE - 1);
      if (sendErr) break;
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
      if ((sendRows ?? []).length < COUNT_PAGE) break;
    }
  } catch {
    // no engagement available; degrade to status-only
  }

  // Download clicks per src tag used in the body's links: people who reached
  // /go/download from this campaign after the send (bots and prefetches are
  // already filtered out). The email's own click total counts clicks on any
  // link, so the two can differ. Best-effort; omitted on a query error.
  const sinceIso =
    (campaign.materialized_at as string | null) ?? (campaign.created_at as string | null);
  const downloadClicks: { src: string; count: number }[] = [];
  if (sinceIso) {
    for (const src of extractSrcTags(String(campaign.body ?? ""))) {
      const { count: clicks, error: clickErr } = await db
        .from("activity_events")
        .select("id", { count: "exact", head: true })
        .eq("kind", "trial_click")
        .eq("is_bot", false)
        .eq("hidden", false)
        .eq("source", src)
        .gte("created_at", sinceIso);
      if (clickErr) break;
      downloadClicks.push({ src, count: clicks ?? 0 });
    }
  }

  return NextResponse.json({
    campaign: { ...campaign, category: campaignCategory(id) },
    downloadClicks,
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
