import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { resolveDurationMonths, resolveRatePercent } from "@/lib/affiliate-commissions";
import { sendLifetimeTermsEmail } from "@/lib/affiliate-lifetime-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set a custom commission rate + duration for one affiliate.
 *
 * commissionPercent          the affiliate's total promised rate (0..100). We
 *                            top up the gap between this and what LS actually
 *                            paid (see src/lib/affiliate-commissions.ts).
 * commissionDurationMonths   how long we honor the elevated rate, counted from
 *                            each referred customer's first order. null =
 *                            lifetime (never expires); a positive integer honors
 *                            it for that many months.
 *
 * Pass commissionPercent null to clear the custom rate (falls back to 30%).
 */

type TermsClient = {
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

type TermsBody = {
  userId?: string;
  commissionPercent?: number | null;
  commissionDurationMonths?: number | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.terms.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: TermsBody;
  try {
    body = (await request.json()) as TermsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Percent: null clears the custom rate; otherwise must be an integer 0..100.
  let commissionPercent: number | null = null;
  if (body.commissionPercent !== null && body.commissionPercent !== undefined) {
    const p = Math.round(Number(body.commissionPercent));
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return NextResponse.json({ error: "commissionPercent must be 0-100" }, { status: 400 });
    }
    commissionPercent = p;
  }

  // Duration: null = lifetime; otherwise a positive integer number of months.
  let commissionDurationMonths: number | null = null;
  if (body.commissionDurationMonths !== null && body.commissionDurationMonths !== undefined) {
    const m = Math.round(Number(body.commissionDurationMonths));
    if (!Number.isFinite(m) || m <= 0) {
      return NextResponse.json(
        { error: "commissionDurationMonths must be a positive number or null" },
        { status: 400 },
      );
    }
    commissionDurationMonths = m;
  }

  const supabase = createAdminClient() as unknown as TermsClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Read the current terms + contact details first so we can email the
  // affiliate when they are newly granted lifetime terms. Best-effort: a read
  // failure only skips the email.
  let wasLifetime = true;
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  let affiliateCode: string | null = null;
  try {
    const { data: before } = await supabase
      .from("profiles")
      .select("email,display_name,affiliate_code,commission_percent,commission_duration_months")
      .eq("id", userId)
      .maybeSingle();
    if (before) {
      wasLifetime =
        resolveDurationMonths({
          commissionPercent:
            typeof before.commission_percent === "number" ? before.commission_percent : null,
          commissionDurationMonths:
            typeof before.commission_duration_months === "number"
              ? before.commission_duration_months
              : null,
        }) === null;
      recipientEmail = typeof before.email === "string" ? before.email : null;
      recipientName =
        typeof before.display_name === "string" && before.display_name.trim()
          ? before.display_name
          : null;
      affiliateCode = typeof before.affiliate_code === "string" ? before.affiliate_code : null;
    }
    if (!recipientName) {
      const { data: app } = await supabase
        .from("affiliate_applications")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (app && typeof app.full_name === "string" && app.full_name.trim()) {
        recipientName = app.full_name;
      }
    }
  } catch (err) {
    console.warn("admin-terms: pre-read skipped", err);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      commission_percent: commissionPercent,
      commission_duration_months: commissionDurationMonths,
      commission_terms_updated_at: new Date().toISOString(),
      commission_terms_updated_by: actor.email,
    })
    .eq("id", userId);

  if (error) {
    console.error("admin-terms: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Newly lifetime (was capped, now never expires): thank the affiliate.
  const newTerms = { commissionPercent, commissionDurationMonths };
  const isLifetime = resolveDurationMonths(newTerms) === null;
  let lifetimeEmailSent = false;
  if (!wasLifetime && isLifetime && recipientEmail) {
    lifetimeEmailSent = await sendLifetimeTermsEmail({
      to: recipientEmail,
      name: recipientName,
      ratePercent: resolveRatePercent(newTerms),
      affiliateCode,
    });
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.terms",
    targetType: "user",
    targetId: userId,
    details: { commissionPercent, commissionDurationMonths, lifetimeEmailSent },
  });

  return NextResponse.json({
    ok: true,
    commissionPercent,
    commissionDurationMonths,
    lifetimeEmailSent,
  });
}
