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

// Comp plans: Pro monthly tiers plus the Daily Deals Workspace add-on. The free
// window is expressed in months. (Seat count comes from the tier: Solo 1, Team
// 10, Agency 25; the add-on is 1.)
const ALLOWED_PLANS = new Set(["monthly", "team-monthly", "agency-monthly", "daily-deals-addon"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MONTHS = 36;
const MAX_SEATS = 100;

type Body = {
  email?: unknown;
  name?: unknown;
  months?: unknown;
  plan?: unknown;
  seats?: unknown;
  forever?: unknown;
  allowExisting?: unknown;
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
  const forever = body.forever === true;
  const allowExisting = body.allowExisting === true;
  const months = forever
    ? null
    : typeof body.months === "number"
      ? body.months
      : Number.parseInt(String(body.months), 10);

  // Email is optional: omit it to mint an unassigned key the admin hands out.
  // When one IS given, it must be well-formed.
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }
  if (!forever && (!Number.isInteger(months) || (months as number) < 1 || (months as number) > MAX_MONTHS)) {
    return NextResponse.json(
      { error: `Free months must be a whole number between 1 and ${MAX_MONTHS}, or mark the comp as forever.` },
      { status: 400 },
    );
  }
  if (!ALLOWED_PLANS.has(plan)) {
    return NextResponse.json({ error: "Unsupported plan." }, { status: 400 });
  }

  // Optional seat override. Absent -> issuer applies the plan's default seat count.
  let seats: number | undefined;
  if (body.seats != null && body.seats !== "") {
    const parsed = typeof body.seats === "number" ? body.seats : Number.parseInt(String(body.seats), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SEATS) {
      return NextResponse.json(
        { error: `Seats must be a whole number between 1 and ${MAX_SEATS}.` },
        { status: 400 },
      );
    }
    seats = parsed;
  }

  const result = await issueInHouseComp({ email, name, months, plan, seats, forever, allowExisting });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  console.log("comps/create: issued in-house comp", {
    by: actor.email,
    email: result.email,
    months,
    forever,
    seats: result.activationLimit,
    plan,
  });

  return NextResponse.json({
    ok: true,
    key: result.key,
    email: result.email,
    months,
    forever,
    activationLimit: result.activationLimit,
    expiresAt: result.expiresAt,
  });
}
