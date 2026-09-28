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
// window is expressed in months OR days. (Seat count comes from the tier: Solo 1,
// Trio 3, Team 10, Agency 25; the add-on is 1.)
const ALLOWED_PLANS = new Set([
  "monthly",
  "duo-monthly",
  "team-monthly",
  "agency-monthly",
  "daily-deals-addon",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MONTHS = 36;
const MAX_DAYS = 1095; // ~3 years, mirroring the 36-month ceiling.
const MAX_SEATS = 100;

type Body = {
  email?: unknown;
  name?: unknown;
  /** Free-window length. Exactly one of months/days is used (days wins). */
  months?: unknown;
  days?: unknown;
  plan?: unknown;
  seats?: unknown;
  forever?: unknown;
  allowExisting?: unknown;
};

/** Parse an optional integer field ("", null, undefined -> null; else the number). */
function optionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : NaN;
}

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
  // Free window: forever ignores both; otherwise a day window (if given) takes
  // precedence over months, matching issueInHouseComp's own precedence rule.
  const days = forever ? null : optionalInt(body.days);
  const months = forever || (days != null && !Number.isNaN(days)) ? null : optionalInt(body.months);

  // Email is optional: omit it to mint an unassigned key the admin hands out.
  // When one IS given, it must be well-formed.
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }
  if (!forever) {
    if (days != null) {
      if (Number.isNaN(days) || days < 1 || days > MAX_DAYS) {
        return NextResponse.json(
          { error: `Free days must be a whole number between 1 and ${MAX_DAYS}, or mark the comp as forever.` },
          { status: 400 },
        );
      }
    } else if (months == null || Number.isNaN(months) || months < 1 || months > MAX_MONTHS) {
      return NextResponse.json(
        { error: `Free months must be a whole number between 1 and ${MAX_MONTHS}, or mark the comp as forever.` },
        { status: 400 },
      );
    }
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

  const result = await issueInHouseComp({ email, name, months, days, plan, seats, forever, allowExisting });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  console.log("comps/create: issued in-house comp", {
    by: actor.email,
    email: result.email,
    months,
    days,
    forever,
    seats: result.activationLimit,
    plan,
  });

  return NextResponse.json({
    ok: true,
    key: result.key,
    email: result.email,
    months,
    days,
    forever,
    activationLimit: result.activationLimit,
    expiresAt: result.expiresAt,
  });
}
