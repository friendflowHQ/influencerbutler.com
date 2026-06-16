import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import type { PermissionKey } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GuidedAction = "refund" | "comp" | "plan";

type Body = {
  action?: string;
  lsSubscriptionId?: string;
  lsOrderId?: string;
  note?: string;
};

/**
 * Records intent and returns a Lemon Squeezy dashboard deep-link for actions we
 * deliberately do NOT mutate blindly via the API: refunds (money), comping /
 * extending, and plan changes. LS either has no safe programmatic endpoint or
 * the semantics are risky, so the operator completes the action in the LS
 * dashboard while we keep an audit trail of who initiated it and why.
 *
 * Each action maps to its own permission so an assistant can be granted, say,
 * comp but not refund.
 */
const ACTION_PERMISSION: Record<GuidedAction, PermissionKey> = {
  refund: "billing.refund",
  comp: "billing.comp",
  plan: "billing.plan.edit",
};

const LS_DASHBOARD = "https://app.lemonsqueezy.com";

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as GuidedAction | undefined;
  if (!action || !(action in ACTION_PERMISSION)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const actor = await requirePermission(ACTION_PERMISSION[action], request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lsSubscriptionId = (body.lsSubscriptionId ?? "").trim() || null;
  const lsOrderId = (body.lsOrderId ?? "").trim() || null;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  // Best-effort deep link. LS dashboard paths vary; orders/subscriptions list
  // pages are stable entry points.
  const deepLink =
    action === "refund" && lsOrderId
      ? `${LS_DASHBOARD}/orders`
      : lsSubscriptionId
        ? `${LS_DASHBOARD}/subscriptions`
        : `${LS_DASHBOARD}`;

  await logAdminAction({
    actor,
    action: `billing.${action}.intent`,
    targetType: lsSubscriptionId ? "subscription" : lsOrderId ? "order" : "billing",
    targetId: lsSubscriptionId ?? lsOrderId ?? null,
    details: { note },
  });

  return NextResponse.json({
    ok: true,
    guided: true,
    deepLink,
    message:
      action === "refund"
        ? "Refunds are completed in the Lemon Squeezy dashboard. This action has been logged."
        : action === "comp"
          ? "Comp / extend is completed in the Lemon Squeezy dashboard. This action has been logged."
          : "Plan changes are completed in the Lemon Squeezy dashboard. This action has been logged.",
  });
}
