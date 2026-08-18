/**
 * Admin campaigns API for the email marketing engine.
 *
 * GET   /api/admin/emails/campaigns
 *   Latest campaigns with per-status recipient counts and the email_sends
 *   category key for stats lookups.
 * POST  { name, subject, body, audience }        create a draft
 * PATCH { id, action, ... } where action is one of:
 *   "update"    edit a draft's fields
 *   "send"      queue a draft for the cron to materialize + send
 *   "schedule"  { scheduledAt } future-date a draft
 *   "cancel"    stop a draft or in-flight send (queued recipients skipped)
 *   "duplicate" copy into a fresh draft
 *   "test"      { toEmail } send the body to one address right now
 *
 * Depends on the 20260817_email_marketing migration; responses degrade with
 * migrationPending until it is applied.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE, parseAudience, type Audience } from "@/lib/email-audience";
import { MARKETING_FROM, campaignCategory } from "@/lib/email-marketing";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { isMissingTable } from "@/lib/growth-goals";
import { intakeAttachments, type NormalizedAttachment } from "@/lib/email-attachments";
import { buildCampaignEmail } from "@/lib/campaign-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;
const COUNT_PAGE = 1000;
const COUNT_CAP = 20000;

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: unknown;
  status: string;
  scheduled_at: string | null;
  materialized_at: string | null;
  created_by: string;
  created_at: string;
  sent_at: string | null;
  attachments?: NormalizedAttachment[] | null;
  inline_images?: NormalizedAttachment[] | null;
};

// A write that references the attachments/inline_images columns fails with one
// of these when the 20260818 migration has not been applied yet. We retry the
// write without the media columns so campaign editing keeps working, and flag
// mediaUnsaved so the UI can nudge the operator to apply the migration.
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const m = (error.message || "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

type RecipientCounts = { queued: number; sent: number; skipped: number; failed: number };

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function emptyCounts(): RecipientCounts {
  return { queued: 0, sent: 0, skipped: 0, failed: 0 };
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await db
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.error("admin emails/campaigns: query failed", error);
    return NextResponse.json({ campaigns: [], migrationPending: true });
  }

  const campaigns = (data ?? []) as CampaignRow[];
  const countsById = new Map<string, RecipientCounts>();

  if (campaigns.length > 0) {
    const ids = campaigns.map((c) => c.id);
    for (let offset = 0; offset < COUNT_CAP; offset += COUNT_PAGE) {
      const { data: recRows, error: recErr } = await db
        .from("email_campaign_recipients")
        .select("campaign_id, status")
        .in("campaign_id", ids)
        .range(offset, offset + COUNT_PAGE - 1);
      if (recErr) break;
      for (const row of recRows ?? []) {
        if (typeof row.campaign_id !== "string" || typeof row.status !== "string") continue;
        const counts = countsById.get(row.campaign_id) ?? emptyCounts();
        if (row.status in counts) {
          counts[row.status as keyof RecipientCounts] += 1;
        }
        countsById.set(row.campaign_id, counts);
      }
      if ((recRows ?? []).length < COUNT_PAGE) break;
    }
  }

  return NextResponse.json({
    campaigns: campaigns.map((row) => ({
      ...row,
      category: campaignCategory(row.id),
      counts: countsById.get(row.id) ?? emptyCounts(),
    })),
    migrationPending: false,
  });
}

type ValidatedFields = {
  name?: string;
  subject?: string;
  body?: string;
  audience?: Audience;
};

/**
 * Validates the editable campaign fields present on an untrusted body.
 * Returns null with an error message when a provided field is unusable.
 */
function validateFields(
  raw: { name?: unknown; subject?: unknown; body?: unknown; audience?: unknown },
  requireAll: boolean,
): { fields: ValidatedFields } | { error: string } {
  const fields: ValidatedFields = {};

  if (typeof raw.name === "string") {
    const name = raw.name.trim().slice(0, 200);
    if (name.length === 0) return { error: "name is required" };
    fields.name = name;
  } else if (requireAll) {
    return { error: "name is required" };
  }

  if (typeof raw.subject === "string") {
    fields.subject = raw.subject.trim().slice(0, 200);
  } else if (requireAll) {
    fields.subject = "";
  }

  if (typeof raw.body === "string") {
    fields.body = raw.body.slice(0, 10000);
  } else if (requireAll) {
    fields.body = "";
  }

  if (raw.audience !== undefined) {
    const audience = parseAudience(raw.audience);
    if (!audience) return { error: "Invalid audience" };
    fields.audience = audience;
  } else if (requireAll) {
    return { error: "audience is required" };
  }

  return { fields };
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    name?: unknown; subject?: unknown; body?: unknown; audience?: unknown;
    attachments?: unknown; inlineImages?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateFields(body, true);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const media = intakeAttachments(body);
  if (!media.ok) return NextResponse.json({ error: media.error }, { status: 400 });
  const hasMedia = media.attachments.length > 0 || media.inlineImages.length > 0;

  const baseRow = { ...validated.fields, status: "draft", created_by: actor.email };
  let mediaUnsaved = false;
  let { data, error } = await db
    .from("email_campaigns")
    .insert({ ...baseRow, attachments: media.attachments, inline_images: media.inlineImages })
    .select("id")
    .single();
  if (error && isMissingColumn(error)) {
    // Media columns not migrated yet: still let the draft save.
    ({ data, error } = await db.from("email_campaigns").insert(baseRow).select("id").single());
    mediaUnsaved = hasMedia;
  }
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("admin emails/campaigns: insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id, ...(mediaUnsaved ? { mediaUnsaved: true } : {}) });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    id?: unknown;
    action?: unknown;
    name?: unknown;
    subject?: unknown;
    body?: unknown;
    audience?: unknown;
    scheduledAt?: unknown;
    toEmail?: unknown;
    attachments?: unknown;
    inlineImages?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : null;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  const { data: found, error: findErr } = await db
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    if (isMissingTable(findErr)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("admin emails/campaigns: lookup failed", findErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!found) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const campaign = found as CampaignRow;

  if (action === "update") {
    if (campaign.status !== "draft") {
      return NextResponse.json({ error: "Only drafts can be edited" }, { status: 409 });
    }
    const validated = validateFields(body, false);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    // Media is only intaken when the client sent at least one of the arrays,
    // so a plain field edit never rewrites (or clears) stored attachments.
    const sentMedia = body.attachments !== undefined || body.inlineImages !== undefined;
    const media = intakeAttachments(body);
    if (!media.ok) return NextResponse.json({ error: media.error }, { status: 400 });
    if (Object.keys(validated.fields).length === 0 && !sentMedia) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const hasMedia = media.attachments.length > 0 || media.inlineImages.length > 0;

    let mediaUnsaved = false;
    let { error } = await db
      .from("email_campaigns")
      .update(
        sentMedia
          ? { ...validated.fields, attachments: media.attachments, inline_images: media.inlineImages }
          : validated.fields,
      )
      .eq("id", id);
    if (error && sentMedia && isMissingColumn(error)) {
      ({ error } = await db.from("email_campaigns").update(validated.fields).eq("id", id));
      mediaUnsaved = hasMedia;
    }
    if (error) {
      console.error("admin emails/campaigns: update failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...(mediaUnsaved ? { mediaUnsaved: true } : {}) });
  }

  if (action === "send") {
    if (campaign.status !== "draft") {
      return NextResponse.json({ error: "Only drafts can be sent" }, { status: 409 });
    }
    const { error } = await db
      .from("email_campaigns")
      .update({ status: "sending", scheduled_at: null })
      .eq("id", id);
    if (error) {
      console.error("admin emails/campaigns: send failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "schedule") {
    if (campaign.status !== "draft") {
      return NextResponse.json({ error: "Only drafts can be scheduled" }, { status: 409 });
    }
    const scheduledAt = typeof body.scheduledAt === "string" ? Date.parse(body.scheduledAt) : NaN;
    if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
      return NextResponse.json({ error: "scheduledAt must be a future date" }, { status: 400 });
    }
    const { error } = await db
      .from("email_campaigns")
      .update({ scheduled_at: new Date(scheduledAt).toISOString() })
      .eq("id", id);
    if (error) {
      console.error("admin emails/campaigns: schedule failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (campaign.status !== "draft" && campaign.status !== "sending") {
      return NextResponse.json({ error: "Only drafts or sending campaigns can be cancelled" }, { status: 409 });
    }
    const { error } = await db.from("email_campaigns").update({ status: "cancelled" }).eq("id", id);
    if (error) {
      console.error("admin emails/campaigns: cancel failed", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    // Best-effort: park the unsent queue so counts read honestly.
    const { error: skipErr } = await db
      .from("email_campaign_recipients")
      .update({ status: "skipped" })
      .eq("campaign_id", id)
      .eq("status", "queued");
    if (skipErr) {
      console.error("admin emails/campaigns: cancel queue-skip failed", skipErr);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "duplicate") {
    const copy = {
      name: `${campaign.name} copy`.slice(0, 200),
      subject: campaign.subject,
      body: campaign.body,
      audience: campaign.audience,
      status: "draft",
      created_by: actor.email,
    };
    let { data, error } = await db
      .from("email_campaigns")
      .insert({
        ...copy,
        attachments: campaign.attachments ?? [],
        inline_images: campaign.inline_images ?? [],
      })
      .select("id")
      .single();
    if (error && isMissingColumn(error)) {
      ({ data, error } = await db.from("email_campaigns").insert(copy).select("id").single());
    }
    if (error) {
      console.error("admin emails/campaigns: duplicate failed", error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === "test") {
    const toEmail =
      typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : "";
    if (!toEmail || !EMAIL_RE.test(toEmail)) {
      return NextResponse.json({ error: "A valid toEmail is required" }, { status: 400 });
    }
    const built = buildCampaignEmail({
      body: campaign.body,
      attachments: campaign.attachments ?? [],
      inlineImages: campaign.inline_images ?? [],
    });
    const ok = await sendMarketingEmail({
      from: MARKETING_FROM,
      to: toEmail,
      subject: campaign.subject,
      text: built.text,
      html: built.html,
      attachments: built.attachments,
      category: "campaign_test",
      funnel: "campaign",
    });
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
