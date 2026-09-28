import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { adminService } from "@/lib/admin-service";
import { lsApi } from "@/lib/lemonsqueezy";
import { sendTrialExtendedEmail, formatTrialDate } from "@/lib/trial-extended-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lsSubscriptionId?: string; months?: number; notify?: boolean };

type LsSubscription = {
  data?: {
    attributes?: {
      status?: string;
      trial_ends_at?: string | null;
      user_email?: string | null;
      product_name?: string | null;
      variant_name?: string | null;
    };
  };
};

const MAX_MONTHS = 12;

/** Adds N calendar months to an ISO timestamp, in UTC. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/**
 * Extends a Lemon Squeezy free trial by N months via the LS API and (unless
 * notify is false) emails the customer a notice. Only works on subscriptions
 * that are currently on_trial: an active subscription has no trial date, and LS
 * rejects a PATCH that sets trial_ends_at to a past date. Gated by billing.comp
 * and audited. This is the API-backed path the guided "Comp / extend" button
 * only deep-linked to before.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("billing.comp", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.lsSubscriptionId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing lsSubscriptionId" }, { status: 400 });
  }
  if (id.startsWith("comp:")) {
    return NextResponse.json(
      { error: "This is an in-house comp, not a Lemon Squeezy trial. Manage it on the Comps page." },
      { status: 400 },
    );
  }
  const months = Number(body.months);
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return NextResponse.json(
      { error: `months must be a whole number from 1 to ${MAX_MONTHS}` },
      { status: 400 },
    );
  }
  const notify = body.notify !== false;

  // Read the live trial state from Lemon Squeezy. trial_ends_at is not stored
  // locally, so it must come from LS.
  const getRes = await lsApi(`/subscriptions/${encodeURIComponent(id)}`, { method: "GET" });
  if (!getRes.ok) {
    if (getRes.status === 404) {
      return NextResponse.json({ error: "Subscription not found in Lemon Squeezy." }, { status: 404 });
    }
    const text = await getRes.text().catch(() => "");
    console.error("billing/extend-trial: LS get failed", getRes.status, text.slice(0, 300));
    return NextResponse.json(
      { error: `Lemon Squeezy lookup failed (${getRes.status}).` },
      { status: 502 },
    );
  }

  const attrs = ((await getRes.json()) as LsSubscription).data?.attributes ?? {};
  const status = attrs.status ?? "";
  const currentTrialEndsAt = attrs.trial_ends_at ?? null;
  const email = (attrs.user_email ?? "").trim();
  const planName = attrs.product_name || attrs.variant_name || "your plan";

  if (status !== "on_trial" || !currentTrialEndsAt) {
    return NextResponse.json(
      {
        error:
          "This subscription is not on a trial, so there is no trial to extend. Use Comp / extend for active subscriptions.",
      },
      { status: 409 },
    );
  }

  const newTrialEndsAt = addMonths(currentTrialEndsAt, months);

  // Extend the trial. LS re-validates trial_ends_at on every subscription PATCH
  // and 422s on a past/invalid date (see subscription/upgrade route).
  const patchRes = await lsApi(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: { type: "subscriptions", id, attributes: { trial_ends_at: newTrialEndsAt } },
    }),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    console.error("billing/extend-trial: LS patch failed", patchRes.status, text.slice(0, 300));
    if (patchRes.status === 422) {
      return NextResponse.json(
        { error: "Lemon Squeezy rejected the new trial date (422). The trial may already have ended." },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: `Lemon Squeezy trial extend failed (${patchRes.status}).` },
      { status: 502 },
    );
  }

  // Best-effort local sync so the admin UI shows the new billing date before the
  // subscription_updated webhook lands. renews_at tracks trial_ends_at while on
  // trial (the first charge happens then). Do not fail on a write error.
  const svc = adminService();
  if (svc) {
    const { error: updateError } = await svc
      .from("subscriptions")
      .update({ renews_at: newTrialEndsAt })
      .eq("ls_subscription_id", id);
    if (updateError) {
      console.error("billing/extend-trial: local subscriptions update failed", updateError);
    }
  }

  let emailed = false;
  if (notify) {
    if (email) {
      emailed = await sendTrialExtendedEmail({ to: email, planName, newTrialEndsAt, monthsAdded: months });
    } else {
      console.error("billing/extend-trial: no customer email on the LS subscription");
    }
  }

  await logAdminAction({
    actor,
    action: "billing.extend_trial",
    targetType: "subscription",
    targetId: id,
    details: { months, oldTrialEndsAt: currentTrialEndsAt, newTrialEndsAt, notify, emailed },
  });

  const when = formatTrialDate(newTrialEndsAt);
  const emailNote = !notify
    ? " Customer was not emailed."
    : emailed
      ? " Customer emailed."
      : " Trial extended, but the customer email did not send.";
  return NextResponse.json({
    ok: true,
    newTrialEndsAt,
    emailed,
    message: `Trial extended to ${when}.${emailNote}`,
  });
}
