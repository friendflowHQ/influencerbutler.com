/**
 * Admin API for the built-in (code-defined) email funnels shown in the
 * Sequences tab as read-and-edit "system sequences".
 *
 * GET   returns the 5 funnels with their steps, each step's editable copy
 *       (override or code default), timing, tag, and per-funnel enter/convert
 *       counts + a global unsubscribe count.
 * PATCH upserts or resets a per-step override in email_funnel_overrides.
 *
 * The override table is optional: without it, GET returns code defaults and
 * PATCH reports migrationPending. Sends always fall back to code copy.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTag } from "@/lib/email-audience";
import { loadFunnelOverrides, resolveFunnelCopy } from "@/lib/funnel-copy";
import {
  SYSTEM_FUNNELS,
  previewVars,
  funnelDefaults,
  isValidStep,
} from "@/lib/system-funnels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function undefinedColumn(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42703";
}

async function countNotNull(
  db: SupabaseClient,
  table: string,
  column: string,
): Promise<number | null> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .not(column, "is", null);
  if (error) return null;
  return count ?? 0;
}

// Per-funnel entered/converted sources (mirrors funnels/route.ts).
const FUNNEL_STATS: Record<
  string,
  { table: string; enteredCol: string; convertedCol: string | null; convertedLabel: string | null }
> = {
  trial: {
    table: "subscriptions",
    enteredCol: "trial_email_day0_sent_at",
    convertedCol: "trial_converted_at",
    convertedLabel: "converted to paid",
  },
  pro: { table: "subscriptions", enteredCol: "pro_email_day0_sent_at", convertedCol: null, convertedLabel: null },
  onboarding: {
    table: "email_subscribers",
    enteredCol: "onboarding_email_day0_sent_at",
    convertedCol: "onboarding_converted_at",
    convertedLabel: "converted",
  },
  winback: {
    table: "subscription_cancel_reasons",
    enteredCol: "winback_t1_sent_at",
    convertedCol: "winback_comp_claimed_at",
    convertedLabel: "comp claimed",
  },
  conversion: {
    table: "affiliate_applications",
    enteredCol: "conversion_email_1h_sent_at",
    convertedCol: null,
    convertedLabel: null,
  },
};

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const overrides = await loadFunnelOverrides(db);

  const funnels = await Promise.all(
    SYSTEM_FUNNELS.map(async (f) => {
      const stats = FUNNEL_STATS[f.key];
      const entered = stats ? await countNotNull(db, stats.table, stats.enteredCol) : null;
      const converted =
        stats && stats.convertedCol ? await countNotNull(db, stats.table, stats.convertedCol) : null;

      const sampleVars = previewVars(f.key);
      // Editable defaults render each variable AS its {{token}}, so a
      // non-overridden step opens in the editor as a proper template (with
      // {{firstName}} etc.) rather than sample-rendered text that would bake in
      // "Alex" if saved verbatim.
      const tokenVars: Record<string, unknown> = {};
      for (const v of f.vars) tokenVars[v] = `{{${v}}}`;

      const steps = f.steps.map((s) => {
        const ov = overrides.get(`${f.key}:${s.tier}`);
        const templateDefaults = funnelDefaults(f.key, s.tier, tokenVars);
        const sampleDefaults = funnelDefaults(f.key, s.tier, sampleVars);
        // Preview = override rendered against sample vars, else the sample default.
        const resolved = resolveFunnelCopy({
          funnel: f.key,
          tier: s.tier,
          vars: sampleVars,
          defaults: sampleDefaults,
          overrides,
        });
        const rawSubject =
          ov?.subject && ov.subject.trim().length > 0 ? ov.subject : templateDefaults.subject;
        const rawBody = ov?.body && ov.body.trim().length > 0 ? ov.body : templateDefaults.body;
        return {
          tier: s.tier,
          label: s.label,
          category: s.category,
          day_offset: ov?.dayOffset ?? s.defaultDayOffset,
          subject: rawSubject,
          subjectPreview: resolved.subject,
          body: rawBody,
          apply_tag: ov?.applyTag ?? null,
          isOverridden: Boolean(
            ov && (ov.subject || ov.body || ov.applyTag || ov.dayOffset != null),
          ),
        };
      });

      return {
        funnel: f.key,
        name: f.name,
        description: f.description,
        tooltip: f.tooltip,
        vars: f.vars,
        entered,
        converted,
        convertedLabel: stats?.convertedLabel ?? null,
        steps,
      };
    }),
  );

  const { count: unsubscribes } = await db
    .from("email_suppressions")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({ funnels, unsubscribes: unsubscribes ?? 0, migrationPending: false });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    funnel?: unknown;
    tier?: unknown;
    action?: unknown;
    subject?: unknown;
    body?: unknown;
    applyTag?: unknown;
    dayOffset?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const funnel = typeof body.funnel === "string" ? body.funnel : "";
  const tier = typeof body.tier === "string" ? body.tier : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!isValidStep(funnel, tier)) {
    return NextResponse.json({ error: "Unknown funnel step" }, { status: 400 });
  }

  if (action === "reset") {
    const { error } = await db
      .from("email_funnel_overrides")
      .delete()
      .eq("funnel", funnel)
      .eq("tier", tier);
    if (error && !undefinedColumn(error)) {
      const code = (error as { code?: string }).code;
      if (code === "42P01") {
        return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
      }
      console.error("system-sequences: reset failed", error);
      return NextResponse.json({ error: "Reset failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action !== "save") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.slice(0, 300) : null;
  const bodyText = typeof body.body === "string" ? body.body.slice(0, 20000) : null;
  let applyTag: string | null = null;
  if (typeof body.applyTag === "string" && body.applyTag.trim().length > 0) {
    applyTag = normalizeTag(body.applyTag);
    if (!applyTag) return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }
  let dayOffset: number | null = null;
  if (body.dayOffset !== null && body.dayOffset !== undefined && body.dayOffset !== "") {
    const n = Number(body.dayOffset);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return NextResponse.json({ error: "Invalid day offset" }, { status: 400 });
    }
    dayOffset = n;
  }

  const { error } = await db.from("email_funnel_overrides").upsert(
    {
      funnel,
      tier,
      subject,
      body: bodyText,
      apply_tag: applyTag,
      day_offset: dayOffset,
      updated_by: actor.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "funnel,tier" },
  );
  if (error) {
    if ((error as { code?: string }).code === "42P01" || undefinedColumn(error)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("system-sequences: save failed", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
