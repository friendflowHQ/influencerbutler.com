/**
 * GET /api/admin/overview
 *
 * KPI landing data for /dashboard/admin. Resolves the actor (any staff) and
 * returns only the blocks their permissions allow, so an assistant with a
 * partial grant still gets a useful page:
 *   - subscriptions: counts by status + new-this-month + trial conversion (reports.view)
 *   - pendingAffiliates (affiliates.view)
 *   - pendingTestimonials (testimonials.moderate)
 *   - pendingCommunity (community.view)
 *   - webhookErrors24h (webhooks.view)
 *
 * Every count is best-effort: a missing table or column in prod (schema is
 * migrated manually and can lag) nulls that number instead of failing the page.
 */
import { NextResponse } from "next/server";
import { resolveActor, createAdminClient, type Actor } from "@/lib/admin";
import type { PermissionKey } from "@/lib/permissions";
import { TRIAL_LENGTH_DAYS } from "@/lib/pricing-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountBuilder = {
  eq: (col: string, value: string) => CountBuilder;
  neq: (col: string, value: string) => CountBuilder;
  gte: (col: string, value: string) => CountBuilder;
  lte: (col: string, value: string) => CountBuilder;
  not: (col: string, op: string, value: unknown) => CountBuilder;
  then: Promise<{ count: number | null; error: { message?: string } | null }>["then"];
};

type OverviewClient = {
  from: (table: string) => {
    select: (cols: string, options: { count: "exact"; head: true }) => CountBuilder;
  };
};

function hasPerm(actor: Actor, key: PermissionKey): boolean {
  return actor.role === "admin" || actor.permissions.has(key);
}

/** Runs a count query; returns null (never throws) on any error. */
async function safeCount(
  supabase: OverviewClient,
  table: string,
  apply?: (b: CountBuilder) => CountBuilder,
): Promise<number | null> {
  try {
    let builder = supabase.from(table).select("id", { count: "exact", head: true });
    if (apply) builder = apply(builder);
    const { count, error } = await builder;
    if (error) {
      console.error(`admin overview: count on ${table} failed`, error);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    console.error(`admin overview: count on ${table} threw`, error);
    return null;
  }
}

const SUBSCRIPTION_STATUSES = ["active", "on_trial", "past_due", "cancelled", "paused"] as const;

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as OverviewClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const addonVariant = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON ?? null;

  const body: Record<string, unknown> = { admin: { email: actor.email } };
  const jobs: Promise<void>[] = [];

  if (hasPerm(actor, "reports.view")) {
    jobs.push(
      (async () => {
        const statusEntries = await Promise.all(
          SUBSCRIPTION_STATUSES.map(async (status) => {
            const n = await safeCount(supabase, "subscriptions", (b) => {
              let q = b.eq("status", status);
              // The Daily Deals add-on creates extra subscription rows; keep the
              // headline "active" count to real plans when the variant is known.
              if (status === "active" && addonVariant) q = q.neq("ls_variant_id", addonVariant);
              return q;
            });
            return [status, n] as const;
          }),
        );
        const totalCount = await safeCount(supabase, "subscriptions");
        const byStatus = Object.fromEntries(statusEntries) as Record<string, number | null>;
        const known = statusEntries.reduce((sum, [, n]) => (n === null ? sum : sum + n), 0);
        const other =
          totalCount === null || statusEntries.some(([, n]) => n === null)
            ? null
            : Math.max(0, totalCount - known);

        const newThisMonth = await safeCount(supabase, "subscriptions", (b) =>
          b.gte("created_at", startOfMonth),
        );

        // Trial-to-paid conversion over trials that started between 90 days ago
        // and one full trial-length ago, so only FINISHED trials count (a trial
        // younger than TRIAL_LENGTH_DAYS is still running and would understate
        // the rate). Needs trial_converted_at, which arrives with the
        // 20260704_trial_conversion_capture migration: until it is applied in
        // prod these counts error and the tile shows n/a.
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const trialMaturityCutoff = new Date(
          now.getTime() - TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();
        const cohort = await safeCount(supabase, "subscriptions", (b) =>
          b.not("trial_started_at", "is", null).gte("trial_started_at", ninetyDaysAgo).lte("trial_started_at", trialMaturityCutoff),
        );
        const converted = await safeCount(supabase, "subscriptions", (b) =>
          b
            .not("trial_started_at", "is", null)
            .gte("trial_started_at", ninetyDaysAgo)
            .lte("trial_started_at", trialMaturityCutoff)
            .not("trial_converted_at", "is", null),
        );
        const conversionRate =
          cohort !== null && converted !== null && cohort > 0 ? converted / cohort : null;

        body.subscriptions = {
          byStatus,
          other,
          total: totalCount,
          newThisMonth,
          trialCohort90d: cohort,
          trialConverted90d: converted,
          conversionRate,
        };
      })(),
    );
  }

  if (hasPerm(actor, "affiliates.view")) {
    jobs.push(
      (async () => {
        body.pendingAffiliates = await safeCount(supabase, "affiliate_applications", (b) =>
          b.eq("status", "pending"),
        );
      })(),
    );
  }

  if (hasPerm(actor, "testimonials.moderate")) {
    jobs.push(
      (async () => {
        body.pendingTestimonials = await safeCount(supabase, "testimonials", (b) =>
          b.eq("status", "pending"),
        );
      })(),
    );
  }

  if (hasPerm(actor, "community.view")) {
    jobs.push(
      (async () => {
        const [q, a] = await Promise.all([
          safeCount(supabase, "community_questions", (b) => b.eq("status", "pending")),
          safeCount(supabase, "community_answers", (b) => b.eq("status", "pending")),
        ]);
        body.pendingCommunity = q === null && a === null ? null : (q ?? 0) + (a ?? 0);
      })(),
    );
  }

  if (hasPerm(actor, "support.view")) {
    jobs.push(
      (async () => {
        // New (untriaged) Chrome-extension feedback. Null until the
        // 20260708_extension_feedback migration is applied in prod.
        body.newExtensionFeedback = await safeCount(supabase, "extension_feedback", (b) =>
          b.eq("status", "new"),
        );
      })(),
    );
  }

  if (hasPerm(actor, "webhooks.view")) {
    jobs.push(
      (async () => {
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        // Null until the 20260704_webhook_events migration is applied in prod.
        body.webhookErrors24h = await safeCount(supabase, "webhook_events", (b) =>
          b.eq("status", "error").gte("created_at", dayAgo),
        );
      })(),
    );
  }

  await Promise.all(jobs);
  return NextResponse.json(body);
}
