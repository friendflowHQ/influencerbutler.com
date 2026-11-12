// Admin control for the price lock push (Nov 12 - Nov 30 2026).
//
//   GET                      segment sizes (A-E3), the cold report (dry), and
//                            which push emails exist as campaigns and when.
//   POST {action:"create-drafts"}            creates the push emails as DRAFT
//                            campaigns (never scheduled). Idempotent by name.
//   POST {action:"test", toEmail, keys?}     sends a test of each push email
//                            (all by default) to one inbox.
//   POST {action:"snapshot-cold"}            freezes the cold groups as contact
//                            tags pl-e1 / pl-e2 / pl-e3.
//   POST {action:"schedule", keys}           schedules those drafts at their
//                            planned Pacific time. Only after owner approval.
//
// Everything here needs marketing.send. Nothing sends to customers until a
// draft is scheduled.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE } from "@/lib/email-audience";
import { MARKETING_FROM } from "@/lib/email-marketing";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { buildCampaignEmail } from "@/lib/campaign-email";
import { loadPriceLockPeople, segmentAOrigins, segmentCounts } from "@/lib/price-lock-audience";
import { coldReport } from "@/lib/price-lock-cold";
import {
  PRICE_LOCK_EMAILS,
  fromLiz,
  personalizePriceLockBody,
  priceLockCampaignName,
  type PriceLockEmail,
} from "@/lib/price-lock-emails";
import { pacificTimeToUtc } from "@/lib/send-gates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE = "https://www.influencerbutler.com";

function db(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function audienceFor(e: PriceLockEmail) {
  return {
    kind: "price_lock",
    segments: e.segments,
    ...(e.excludeClickersOf ? { excludeClickersOf: e.excludeClickersOf } : {}),
    ...(e.allowSecondToday ? { allowSecondToday: true } : {}),
  };
}

async function existingCampaigns(svc: SupabaseClient) {
  const { data, error } = await svc
    .from("email_campaigns")
    .select("id, name, status, scheduled_at, materialized_at, sent_at")
    .like("name", "Price lock: %");
  if (error) throw new Error("could not read campaigns");
  return (data ?? []) as {
    id: string;
    name: string;
    status: string;
    scheduled_at: string | null;
    materialized_at: string | null;
    sent_at: string | null;
  }[];
}

export async function GET(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const svc = db();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  try {
    const [people, cold, campaigns] = await Promise.all([loadPriceLockPeople(svc), coldReport(svc), existingCampaigns(svc)]);
    const emails = PRICE_LOCK_EMAILS.map((e) => {
      const c = campaigns.find((row) => row.name === priceLockCampaignName(e));
      return {
        key: e.key,
        segments: e.segments,
        subject: e.subject,
        plannedAt: pacificTimeToUtc(e.date, e.hour).toISOString(),
        campaign: c ?? null,
      };
    });
    return NextResponse.json({ ok: true, segments: segmentCounts(people), aOrigins: segmentAOrigins(people), cold, emails });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const svc = db();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { action?: unknown; toEmail?: unknown; keys?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const keys = Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === "string") : null;
  const pick = (all: readonly PriceLockEmail[]) => (keys ? all.filter((e) => keys.includes(e.key)) : all);

  try {
    if (body.action === "create-drafts") {
      const existing = await existingCampaigns(svc);
      const created: string[] = [];
      for (const e of pick(PRICE_LOCK_EMAILS)) {
        const name = priceLockCampaignName(e);
        if (existing.some((c) => c.name === name)) continue;
        // Cold drafts only when asked for by key (they need the cold sending
        // domain), and never with an unfilled placeholder body.
        if (e.cold && !keys) continue;
        if (e.body.includes("{{BEST_COLD_EMAIL_BODY}}")) continue;
        const row: Record<string, unknown> = {
          name,
          subject: e.subject,
          body: e.body,
          audience: audienceFor(e),
          status: "draft",
          stream: e.cold ? "cold" : "lifecycle",
          created_by: actor.email,
        };
        let { error } = await svc.from("email_campaigns").insert(row);
        if (error && /stream/i.test(error.message ?? "") && !e.cold) {
          // Prod has no stream column yet (20260910_email_stream.sql not applied): lifecycle is the default.
          delete row.stream;
          ({ error } = await svc.from("email_campaigns").insert(row));
        }
        if (error) return NextResponse.json({ error: `insert ${e.key} failed`, detail: error.message }, { status: 500 });
        created.push(e.key);
      }
      return NextResponse.json({ ok: true, created });
    }

    if (body.action === "test") {
      const toEmail = typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(toEmail)) return NextResponse.json({ error: "A valid toEmail is required" }, { status: 400 });
      const results: { key: string; ok: boolean }[] = [];
      for (const e of pick(PRICE_LOCK_EMAILS)) {
        const text = personalizePriceLockBody(e.body, { keepPlanUrl: `${SITE}/dashboard/subscription?src=${e.key}-test` });
        const built = buildCampaignEmail({ body: text ?? e.body, attachments: [], inlineImages: [] });
        const ok = await sendMarketingEmail({
          from: fromLiz(MARKETING_FROM),
          to: toEmail,
          subject: `[TEST ${e.key}] ${e.subject}`,
          text: built.text,
          html: built.html,
          category: "campaign_test",
          funnel: "campaign",
          bypassSuppression: true,
        });
        results.push({ key: e.key, ok });
      }
      return NextResponse.json({ ok: results.every((r) => r.ok), results });
    }

    if (body.action === "snapshot-cold") {
      const report = await coldReport(svc, { write: true });
      return NextResponse.json({ ok: true, report });
    }

    if (body.action === "schedule") {
      if (!keys || keys.length === 0) return NextResponse.json({ error: "keys required" }, { status: 400 });
      const existing = await existingCampaigns(svc);
      const scheduled: { key: string; at: string }[] = [];
      for (const e of pick(PRICE_LOCK_EMAILS)) {
        const c = existing.find((row) => row.name === priceLockCampaignName(e));
        if (!c || c.status !== "draft") continue;
        const at = pacificTimeToUtc(e.date, e.hour);
        if (at.getTime() < Date.now() - 60_000) continue; // never schedule into the past
        const { error } = await svc.from("email_campaigns").update({ scheduled_at: at.toISOString() }).eq("id", c.id);
        if (!error) scheduled.push({ key: e.key, at: at.toISOString() });
      }
      return NextResponse.json({ ok: true, scheduled });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
