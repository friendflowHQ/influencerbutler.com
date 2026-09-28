// POST /api/admin/finance/stepup
//
// The only finance route gated on the permission ALONE (it issues the step-up
// verification the other routes require).
//   { action: "send" }                 -> emails a 6-digit code to the actor
//   { action: "verify", code: "123456" } -> opens the ~12h verified window

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { sendFinanceStepUpCode, verifyFinanceStepUpCode } from "@/lib/finance-stepup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("finance.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { action?: string; code?: string };
  try {
    body = (await request.json()) as { action?: string; code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "send") {
    const result = await sendFinanceStepUpCode(actor);
    if (!result.ok) {
      if (result.reason === "migration-pending") return NextResponse.json({ migrationPending: true });
      if (result.reason === "throttled") {
        return NextResponse.json(
          { error: "A code was just sent. Wait a minute before requesting another." },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: "Could not send the code. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sentTo: actor.email });
  }

  if (body.action === "verify") {
    const code = typeof body.code === "string" ? body.code : "";
    if (!/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }
    const result = await verifyFinanceStepUpCode(actor, code);
    if (!result.ok) {
      if (result.reason === "migration-pending") return NextResponse.json({ migrationPending: true });
      const message =
        result.reason === "wrong-code"
          ? "Wrong code. Check the email and try again."
          : result.reason === "expired"
            ? "That code expired. Request a new one."
            : result.reason === "too-many-attempts"
              ? "Too many wrong attempts. Request a new code."
              : "No code is pending. Request one first.";
      return NextResponse.json({ error: message, reason: result.reason }, { status: 400 });
    }
    await logAdminAction({
      actor,
      action: "finance.stepup.verified",
      targetType: "user",
      targetId: actor.userId,
    });
    return NextResponse.json({ ok: true, verifiedUntil: result.verifiedUntil });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
