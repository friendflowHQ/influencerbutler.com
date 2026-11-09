/**
 * POST /api/affiliates/admin-credit-signups
 * Body: { affiliate: string (code or user id), emails: string[], force?: boolean }
 *
 * Retroactively credit existing accounts to an affiliate when the referral was
 * not captured automatically (a no-card trial before attribution existed, a
 * desktop sign-in in a different browser, a lost cookie). For each account:
 *
 *   1. profiles.ref_* stamp, so it counts as a referred signup on the
 *      affiliate's dashboard (channel "web").
 *   2. subscriptions.ref_* on its Lemon Squeezy subscriptions, so the funnel
 *      shows the trial / paid lifecycle AND future renewal payments inherit the
 *      affiliate (the webhook copies subscription attribution onto renewals).
 *      In-house comp rows (`comp:` ids) are left alone: they are free access,
 *      and a stamped one would read as "currently paying".
 *   3. Already-paid, un-attributed orders, via the same helper as
 *      admin-attribute-order, so the owed report pays them.
 *
 * Guarded like admin-attribute-order: never overwrites attribution held by a
 * DIFFERENT affiliate unless `force` is set; self-referral is refused. Each
 * call is audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  resolveAdminAffiliate,
  escapeLike,
  asQueryClient,
  attributeOrdersToAffiliate,
} from "@/lib/affiliate-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EMAILS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = { affiliate?: unknown; emails?: unknown; force?: unknown };

type Outcome = {
  email: string;
  status: "credited" | "already" | "skipped" | "error";
  reason?: string;
  subscriptionsStamped?: number;
  ordersStamped?: number;
};

// Minimal structural typing for the service client (the generated types are
// not shared with route handlers here).
type AnyClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const affiliateInput = typeof body.affiliate === "string" ? body.affiliate.trim() : "";
  if (!affiliateInput) {
    return NextResponse.json({ error: "Choose an affiliate (code or user id)." }, { status: 400 });
  }
  const emails = Array.isArray(body.emails)
    ? [
        ...new Set(
          body.emails
            .filter((e): e is string => typeof e === "string")
            .map((e) => e.trim().toLowerCase())
            .filter((e) => EMAIL_RE.test(e)),
        ),
      ]
    : [];
  if (emails.length === 0) {
    return NextResponse.json({ error: "Provide at least one valid email." }, { status: 400 });
  }
  if (emails.length > MAX_EMAILS) {
    return NextResponse.json({ error: `At most ${MAX_EMAILS} emails per call.` }, { status: 400 });
  }
  const force = body.force === true;

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const admin = asQueryClient(adminClient);
  const db = adminClient as unknown as AnyClient;

  const aff = await resolveAdminAffiliate(adminClient, affiliateInput);
  if (!aff || !aff.code) {
    return NextResponse.json(
      { error: "No affiliate with a branded code found for that code or user id." },
      { status: 404 },
    );
  }
  const code = aff.code.toUpperCase();

  const results: Outcome[] = [];
  for (const email of emails) {
    try {
      results.push(await creditOne(db, admin, aff.userId, code, email, force));
    } catch (err) {
      console.error("admin-credit-signups: failed for", email, err);
      results.push({ email, status: "error", reason: "Unexpected error" });
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.signups.credit",
    targetType: "user",
    targetId: aff.userId,
    details: { affiliateCode: code, force, results },
  });

  return NextResponse.json({
    ok: results.some((r) => r.status === "credited"),
    affiliateCode: code,
    affiliateName: aff.displayName,
    results,
  });
}

async function creditOne(
  db: AnyClient,
  admin: ReturnType<typeof asQueryClient>,
  affiliateUserId: string,
  code: string,
  email: string,
  force: boolean,
): Promise<Outcome> {
  const { data: profRows, error: profErr } = await db
    .from("profiles")
    .select("id,ref_affiliate_user_id")
    .ilike("email", escapeLike(email))
    .limit(1);
  if (profErr) return { email, status: "error", reason: "Profile lookup failed" };
  const prof = Array.isArray(profRows) ? profRows[0] : null;
  const userId = typeof prof?.id === "string" ? (prof.id as string) : null;
  if (!userId) return { email, status: "skipped", reason: "No account for this email" };
  if (userId === affiliateUserId) {
    return { email, status: "skipped", reason: "Self-referral" };
  }

  const existingRef =
    typeof prof?.ref_affiliate_user_id === "string" ? (prof.ref_affiliate_user_id as string) : null;
  if (existingRef && existingRef !== affiliateUserId && !force) {
    return { email, status: "skipped", reason: "Already credited to a different affiliate" };
  }

  // 1) Profile stamp.
  let profileChanged = false;
  if (existingRef !== affiliateUserId) {
    const base = {
      ref_affiliate_user_id: affiliateUserId,
      ref_affiliate_code: code,
      ref_captured_at: new Date().toISOString(),
    };
    const { error } = await db.from("profiles").update({ ...base, ref_channel: "web" }).eq("id", userId);
    if (error) {
      // Pre-20260826 prod lacks ref_channel.
      const { error: retryErr } = await db.from("profiles").update(base).eq("id", userId);
      if (retryErr) return { email, status: "error", reason: "Profile stamp failed" };
    }
    profileChanged = true;
  }

  // 2) Lemon Squeezy subscriptions (not in-house comp rows).
  let subscriptionsStamped = 0;
  const { data: subs } = await db
    .from("subscriptions")
    .select("id,ls_subscription_id,ref_affiliate_user_id")
    .eq("user_id", userId);
  for (const s of (subs ?? []) as Record<string, unknown>[]) {
    const lsId = typeof s.ls_subscription_id === "string" ? s.ls_subscription_id : "";
    if (!lsId || lsId.startsWith("comp:")) continue;
    const current = typeof s.ref_affiliate_user_id === "string" ? s.ref_affiliate_user_id : null;
    if (current === affiliateUserId) continue;
    if (current && !force) continue;
    const stamp = { ref_affiliate_user_id: affiliateUserId, ref_affiliate_code: code };
    const { error } = await db
      .from("subscriptions")
      .update({ ...stamp, attribution_status: "pending" })
      .eq("id", s.id);
    if (error) {
      const { error: retryErr } = await db.from("subscriptions").update(stamp).eq("id", s.id);
      if (retryErr) {
        console.warn("admin-credit-signups: subscription stamp failed", s.id, retryErr);
        continue;
      }
    }
    subscriptionsStamped += 1;
  }

  // 3) Already-paid, un-attributed orders.
  let ordersStamped = 0;
  const { data: orders } = await admin
    .from("orders")
    .select("ls_order_id,status,ref_affiliate_user_id")
    .eq("user_id", userId);
  const paid = ((orders ?? []) as Record<string, unknown>[]).filter(
    (o) => o.status === "paid" && typeof o.ls_order_id === "string",
  );
  if (paid.length > 0) {
    const { stamped } = await attributeOrdersToAffiliate(
      db,
      { userId: affiliateUserId, code },
      paid.map((o) => ({
        ls_order_id: o.ls_order_id as string,
        ref_affiliate_user_id:
          typeof o.ref_affiliate_user_id === "string" ? o.ref_affiliate_user_id : null,
      })),
      force,
    );
    ordersStamped = stamped.length;
  }

  const changed = profileChanged || subscriptionsStamped > 0 || ordersStamped > 0;
  return {
    email,
    status: changed ? "credited" : "already",
    subscriptionsStamped,
    ordersStamped,
  };
}
