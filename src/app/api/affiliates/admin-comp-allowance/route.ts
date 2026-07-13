import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  sendAffiliateCompWelcomeEmail,
  sendAffiliateCompAllowanceChangedEmail,
} from "@/lib/affiliate-comp-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enable / disable a trusted ("main squeeze") affiliate's ability to hand out
 * limited free Pro workspaces, and set their monthly quota.
 *
 * monthlyQuota   how many comps the affiliate may issue per calendar month.
 *                null or 0 turns the ability off. A positive integer enables it.
 *
 * The comps themselves are always single-seat Solo Pro, capped at a 2-month
 * window, and auto-cancel at expiry - those ceilings are enforced when the comp
 * is issued (see src/lib/affiliate-comps.ts + the affiliates/comps route); this
 * endpoint only sets who may comp and how many per month.
 */

type AllowanceClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

type AllowanceBody = {
  userId?: string;
  monthlyQuota?: number | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.comps.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: AllowanceBody;
  try {
    body = (await request.json()) as AllowanceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Quota: null / 0 disables comps; otherwise a non-negative integer. We store
  // null (not 0) when disabling so "never set" and "explicitly off" read alike.
  let monthlyQuota: number | null = null;
  if (body.monthlyQuota !== null && body.monthlyQuota !== undefined) {
    const q = Math.round(Number(body.monthlyQuota));
    if (!Number.isFinite(q) || q < 0) {
      return NextResponse.json(
        { error: "monthlyQuota must be a non-negative whole number or null" },
        { status: 400 },
      );
    }
    monthlyQuota = q === 0 ? null : q;
  }

  const supabase = createAdminClient() as unknown as AllowanceClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Read the current state first so we can tell "just enabled" from "changed"
  // and notify the affiliate accordingly. Best-effort: a read failure just skips
  // the email, it never blocks the allowance change.
  let previousQuota: number | null = null;
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  try {
    const { data: before } = await supabase
      .from("profiles")
      .select("email,display_name,affiliate_comp_monthly_quota")
      .eq("id", userId)
      .maybeSingle();
    if (before) {
      previousQuota =
        typeof before.affiliate_comp_monthly_quota === "number"
          ? before.affiliate_comp_monthly_quota
          : null;
      recipientEmail = typeof before.email === "string" ? before.email : null;
      recipientName = typeof before.display_name === "string" ? before.display_name : null;
    }
  } catch (err) {
    console.warn("admin-comp-allowance: pre-read skipped", err);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      affiliate_comp_monthly_quota: monthlyQuota,
      affiliate_comp_updated_at: new Date().toISOString(),
      affiliate_comp_updated_by: actor.email,
    })
    .eq("id", userId);

  if (error) {
    console.error("admin-comp-allowance: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Notify the affiliate. Off -> on = the VIP welcome; a change between two live
  // quotas = the lighter "allowance changed" note. Turning it off is silent.
  // Best-effort so a mail hiccup never fails the admin's save.
  const prevActive = (previousQuota ?? 0) > 0;
  const nextActive = (monthlyQuota ?? 0) > 0;
  if (recipientEmail) {
    try {
      if (!prevActive && nextActive) {
        await sendAffiliateCompWelcomeEmail({
          to: recipientEmail,
          name: recipientName,
          quota: monthlyQuota as number,
        });
      } else if (prevActive && nextActive && monthlyQuota !== previousQuota) {
        await sendAffiliateCompAllowanceChangedEmail({
          to: recipientEmail,
          name: recipientName,
          quota: monthlyQuota as number,
          previousQuota,
        });
      }
    } catch (err) {
      console.error("admin-comp-allowance: notify email threw", err);
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.comp.allowance",
    targetType: "user",
    targetId: userId,
    details: { monthlyQuota },
  });

  return NextResponse.json({ ok: true, monthlyQuota });
}
