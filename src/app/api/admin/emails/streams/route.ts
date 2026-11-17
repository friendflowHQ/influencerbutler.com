/**
 * GET /api/admin/emails/streams?days=30
 *
 * Splits recent email metrics into COLD outreach vs WARM (known-audience)
 * vs TRANSACTIONAL, so the blended dashboard CTR (which cold sends drag down)
 * can be read per audience. This is the "why is our click rate terrible"
 * breakdown: cold, unsolicited lists open and click far below lifecycle mail to
 * people who already know us, and averaging them together hides both.
 *
 * There is no cold/warm column on email_sends, so each send is classified by
 * joining its category back to the owning sequence/campaign:
 *   - funnel 'sequence'  -> category seq_<id8>_s<n>   -> that sequence's coldness
 *   - funnel 'campaign'  -> category campaign_<id8>   -> that campaign's coldness
 *   - funnel 'transactional'                          -> transactional bucket
 *   - every other funnel (trial/pro/onboarding/winback/conversion/newsletter)
 *     is lifecycle mail to known users                -> warm bucket
 *
 * "Cold" is detected robustly, because the seeded cold sequences predate the
 * stream column (20260910_email_stream.sql) and still read stream='lifecycle'
 * in prod until someone flips them in the UI: a sequence/campaign counts as cold
 * if stream='cold' OR its name begins with "cold" OR its trigger tag begins with
 * "cold-". So the split is correct today with no manual data cleanup.
 *
 * Counts come from public.email_sends_summary (20261111): one row per
 * (category, funnel) in the window, already counted in Postgres, then bucketed
 * here. Paging every row out (~125k for 30 days) took 8-25s. Until that
 * function exists the route falls back to the row scan.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { shortId } from "@/lib/email-marketing";
import { isMissingFunctionError } from "@/lib/email-sends-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DAYS = new Set([7, 30, 90]);
const BATCH = 1000;

type StreamKey = "cold" | "warm" | "transactional";

export type StreamAggregate = {
  key: StreamKey;
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

type SendRow = {
  category: string;
  funnel: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
};

/** True when a sequence/campaign is cold outreach. Belt-and-suspenders because
 * the stream column is under-populated on the seeded cold sequences: stream
 * marker, then the "Cold ..." name convention, then the cold-* trigger tag. */
function ownerIsCold(row: Record<string, unknown>): boolean {
  if (row.stream === "cold") return true;
  const name = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  if (/^cold\b/.test(name)) return true;
  const trigger = row.trigger as { kind?: unknown; tag?: unknown } | null | undefined;
  if (trigger && trigger.kind === "tag_added" && typeof trigger.tag === "string") {
    if (/^cold[-_]/.test(trigger.tag.trim().toLowerCase())) return true;
  }
  return false;
}

const SEQ_CATEGORY_RE = /^seq_([0-9a-f]{8})_s\d+$/;
const CAMPAIGN_CATEGORY_RE = /^campaign_([0-9a-f]{8})$/;

type Counts = Pick<StreamAggregate, "sent" | "delivered" | "opened" | "clicked" | "bounced">;

// One row of public.email_sends_summary. Its sent/delivered/... rules match
// rowCounts() below: suppressed and failed are not "sent"; each event counts
// when its timestamp is set.
type RollupRow = Counts & { category: string; funnel: string };

function rowCounts(row: SendRow): Counts {
  return {
    sent: row.status !== "suppressed" && row.status !== "failed" ? 1 : 0,
    delivered: row.delivered_at ? 1 : 0,
    opened: row.opened_at ? 1 : 0,
    clicked: row.clicked_at ? 1 : 0,
    bounced: row.bounced_at ? 1 : 0,
  };
}

function bump(agg: StreamAggregate, c: Counts) {
  agg.sent += Number(c.sent) || 0;
  agg.delivered += Number(c.delivered) || 0;
  agg.opened += Number(c.opened) || 0;
  agg.clicked += Number(c.clicked) || 0;
  agg.bounced += Number(c.bounced) || 0;
}

function blank(key: StreamKey, label: string): StreamAggregate {
  return { key, label, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
}

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

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = ALLOWED_DAYS.has(daysRaw) ? daysRaw : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Map each cold sequence/campaign to its category short id so a send can be
  // classified by its category prefix. Only cold owners need mapping: anything
  // not in this set defaults to warm, so we never over-count cold. select("*")
  // tolerates the stream column being absent pre-migration (name/tag still
  // catch cold owners); a missing table degrades to "no cold owners known".
  const coldSeqShortIds = new Set<string>();
  const coldCampaignShortIds = new Set<string>();

  // select("*") tolerates the optional stream column being absent pre-migration:
  // a narrow select naming `stream` would error out entirely and lose the
  // name/tag fallback, which is the only cold signal until stream is populated.
  const { data: seqRows } = await db
    .from("email_sequences")
    .select("*")
    .limit(1000);
  for (const row of (seqRows ?? []) as Array<{ id?: unknown } & Record<string, unknown>>) {
    if (typeof row.id === "string" && ownerIsCold(row)) coldSeqShortIds.add(shortId(row.id));
  }

  const { data: campRows } = await db
    .from("email_campaigns")
    .select("*")
    .limit(2000);
  for (const row of (campRows ?? []) as Array<{ id?: unknown } & Record<string, unknown>>) {
    if (typeof row.id === "string" && ownerIsCold(row)) coldCampaignShortIds.add(shortId(row.id));
  }

  const streams: Record<StreamKey, StreamAggregate> = {
    cold: blank("cold", "Cold outreach"),
    warm: blank("warm", "Warm / known audience"),
    transactional: blank("transactional", "Transactional"),
  };

  /** Which bucket a send belongs to, from its funnel + category. */
  function bucketFor(row: { category: string; funnel: string }): StreamKey {
    if (row.funnel === "transactional") return "transactional";
    if (row.funnel === "sequence") {
      const m = SEQ_CATEGORY_RE.exec(row.category || "");
      return m && coldSeqShortIds.has(m[1]) ? "cold" : "warm";
    }
    if (row.funnel === "campaign") {
      const m = CAMPAIGN_CATEGORY_RE.exec(row.category || "");
      return m && coldCampaignShortIds.has(m[1]) ? "cold" : "warm";
    }
    // trial / pro / onboarding / winback / conversion / newsletter: lifecycle
    // mail to people who already know us.
    return "warm";
  }

  // Fast path: per (category, funnel) counts from Postgres.
  const rollup = await db.rpc("email_sends_summary", { p_since: cutoff });
  if (!rollup.error) {
    for (const row of (rollup.data ?? []) as RollupRow[]) bump(streams[bucketFor(row)], row);
    return NextResponse.json({
      days,
      streams: [streams.cold, streams.warm, streams.transactional],
      migrationPending: false,
    });
  }
  if (!isMissingFunctionError(rollup.error)) {
    // Usually a statement timeout: report it as a transient failure rather
    // than falling into a row scan that would take far longer.
    console.error("admin emails/streams: rollup failed", rollup.error);
    return NextResponse.json({ days, streams: [], migrationPending: false, loadError: true });
  }

  // Fallback (email_sends_summary missing): page rows out and count in JS.
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("email_sends")
      .select("category, funnel, status, delivered_at, opened_at, clicked_at, bounced_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH - 1);
    if (error) {
      console.error("admin emails/streams: query failed", error);
      return NextResponse.json({ days, streams: [], migrationPending: true });
    }
    const rows = (data ?? []) as SendRow[];
    for (const row of rows) bump(streams[bucketFor(row)], rowCounts(row));
    if (rows.length < BATCH) break;
    offset += BATCH;
  }

  return NextResponse.json({
    days,
    streams: [streams.cold, streams.warm, streams.transactional],
    migrationPending: false,
  });
}
