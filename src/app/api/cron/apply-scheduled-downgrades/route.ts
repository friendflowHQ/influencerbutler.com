/**
 * GET /api/cron/apply-scheduled-downgrades
 *
 * Daily (see vercel.json). Applies self-serve Beginner downgrades scheduled
 * via /api/subscription/schedule-downgrade once their renewal date has
 * passed: swaps the Lemon Squeezy variant with invoice_immediately: false so
 * nothing is charged or credited for the cycle that just renewed at the old
 * price - the new (lower) price takes effect on the next invoice.
 *
 * Gated on CRON_SECRET like the other crons. Idempotent via
 * scheduled_plan_applied_at. Add ?dry=1 to preview without swapping, stamping,
 * or emailing. A subscription whose status changed before its renewal (past
 * due, cancelled) is skipped and surfaced in the digest rather than swapped.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { lsApi, resolveVariantId } from "@/lib/lemonsqueezy";
import { verifyBearer } from "@/lib/auth-secret";
import { sendDowngradeDigest, type DowngradeRow } from "@/lib/scheduled-downgrade-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

type DueRow = {
  ls_subscription_id: string;
  user_id: string | null;
  scheduled_plan: string;
};

type LsSubscriptionResponse = {
  data?: { attributes?: { status?: string | null } };
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = createAdminClient();

  const { data: due, error } = await admin
    .from("subscriptions")
    .select("ls_subscription_id,user_id,scheduled_plan")
    .lte("scheduled_plan_effective_at", new Date().toISOString())
    .is("scheduled_plan_applied_at", null)
    .not("scheduled_plan", "is", null);

  if (error) {
    console.error("apply-scheduled-downgrades: query failed", error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rows = (due ?? []) as DueRow[];

  const emailsByUserId = new Map<string, string | null>();
  if (rows.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,email")
      .in("id", rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)));
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      emailsByUserId.set(p.id, p.email);
    }
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      wouldApply: rows.map((r) => ({
        email: emailsByUserId.get(r.user_id ?? "") ?? null,
        lsSubscriptionId: r.ls_subscription_id,
        targetPlan: r.scheduled_plan,
      })),
    });
  }

  const applied: DowngradeRow[] = [];
  const skipped: DowngradeRow[] = [];

  for (const row of rows) {
    const email = emailsByUserId.get(row.user_id ?? "") ?? null;
    const summary: DowngradeRow = {
      email,
      lsSubscriptionId: row.ls_subscription_id,
      targetPlan: row.scheduled_plan,
    };

    try {
      const subResponse = await lsApi(`/subscriptions/${row.ls_subscription_id}`, { method: "GET" });
      if (!subResponse.ok) {
        skipped.push(summary);
        continue;
      }
      const subPayload = (await subResponse.json()) as LsSubscriptionResponse;
      const status = subPayload.data?.attributes?.status ?? null;
      if (status !== "active" && status !== "on_trial") {
        skipped.push(summary);
        await admin
          .from("subscriptions")
          .update({ scheduled_plan: null, scheduled_plan_effective_at: null })
          .eq("ls_subscription_id", row.ls_subscription_id);
        continue;
      }

      const resolution = resolveVariantId(row.scheduled_plan, undefined);
      if (!resolution.ok) {
        console.error("apply-scheduled-downgrades: target variant unresolved", {
          lsSubscriptionId: row.ls_subscription_id,
          targetPlan: row.scheduled_plan,
          resolution,
        });
        skipped.push(summary);
        continue;
      }

      const patchResponse = await lsApi(`/subscriptions/${row.ls_subscription_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "subscriptions",
            id: row.ls_subscription_id,
            attributes: { variant_id: Number(resolution.variantId), invoice_immediately: false },
          },
        }),
      });

      if (!patchResponse.ok) {
        const text = await patchResponse.text().catch(() => "");
        console.error("apply-scheduled-downgrades: variant swap failed", {
          lsSubscriptionId: row.ls_subscription_id,
          status: patchResponse.status,
          text: text.slice(0, 500),
        });
        skipped.push(summary);
        continue;
      }

      const nowIso = new Date().toISOString();
      await admin
        .from("subscriptions")
        .update({
          scheduled_plan: null,
          scheduled_plan_effective_at: null,
          scheduled_plan_applied_at: nowIso,
        })
        .eq("ls_subscription_id", row.ls_subscription_id);

      await logAdminAction({
        actor: null,
        action: "subscription.scheduled_downgrade.applied",
        targetType: "subscription",
        targetId: row.ls_subscription_id,
        details: { source: "cron:apply-scheduled-downgrades", email, targetPlan: row.scheduled_plan },
      });

      applied.push(summary);
    } catch (err) {
      console.error("apply-scheduled-downgrades: row threw", err, { lsSubscriptionId: row.ls_subscription_id });
      skipped.push(summary);
    }
  }

  let emailed = false;
  if (applied.length > 0 || skipped.length > 0) {
    emailed = await sendDowngradeDigest({ applied, skipped });
  }

  return NextResponse.json({ ok: true, applied, skipped, emailed });
}
