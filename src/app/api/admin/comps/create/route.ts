/**
 * POST /api/admin/comps/create
 *
 * Issues a comp (a free, N-month Pro grant) entirely in-house: mints a license
 * key + a synthetic subscription in Supabase, with NO Lemon Squeezy involvement
 * (LS is reserved for real paid subscriptions). Gated on licenses.view (same as
 * the comps list). See src/lib/comp-issue.ts for the mechanics and why an
 * LS-unknown key still unlocks Pro end-to-end.
 *
 * The recipient's account is created if needed, the key is emailed to them, and
 * the key is also returned here so the admin can copy/hand-deliver it.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { issueInHouseComp } from "@/lib/comp-issue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monthly plans only: the free window is expressed in months. (Seat count still
// comes from the tier: Solo 1, Team 10, Agency 25.)
const ALLOWED_PLANS = new Set(["monthly", "team-monthly", "agency-monthly"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MONTHS = 36;

type Body = {
  email?: unknown;
  name?: unknown;
  months?: unknown;
  plan?: unknown;
};

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const plan = typeof body.plan === "string" ? body.plan : "monthly";
  const months =
    typeof body.months === "number"
      ? body.months
      : Number.parseInt(String(body.months), 10);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return NextResponse.json(
      { error: `Free months must be a whole number between 1 and ${MAX_MONTHS}.` },
      { status: 400 },
    );
  }
  if (!ALLOWED_PLANS.has(plan)) {
    return NextResponse.json({ error: "Unsupported plan." }, { status: 400 });
  }

  const result = await issueInHouseComp({ email, name, months, plan });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  console.log("comps/create: issued in-house comp", {
    by: actor.email,
    email: result.email,
    months,
    plan,
  });

  return NextResponse.json({
    ok: true,
    key: result.key,
    email: result.email,
    months,
    expiresAt: result.expiresAt,
  });
}
