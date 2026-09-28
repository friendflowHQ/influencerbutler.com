/**
 * POST /api/app-trial/signup
 * Body: { email: string, first_name?: string | null }
 * Auth: Bearer APP_TRIAL_INTAKE_SECRET
 *
 * Server-to-server intake for desktop-app trial leads: the address someone
 * typed into the startup walkthrough. The licensing worker forwards it here
 * (workers/licensing/src/routes/leads.js) so the shared secret never ships
 * inside the desktop app.
 *
 * Before this existed the forward pointed at a lifecycle worker that was never
 * deployed, so an app-trial user got no email at all: their 14-day trial ended
 * and the app simply locked.
 *
 * The enrolment itself lives in @/lib/app-trial-enroll, shared with the no-card
 * trial route, and is idempotent: a reinstall or a duplicate forward cannot
 * restart the sequence or re-send the welcome.
 */
import { NextResponse } from "next/server";
import { enrollAppTrialLead } from "@/lib/app-trial-enroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAuthorized(request: Request): boolean {
  const secret = process.env.APP_TRIAL_INTAKE_SECRET;
  if (!secret) {
    // Without a secret configured we refuse rather than run open: this route
    // writes to the owned list and arms a send sequence.
    console.error("app-trial signup: APP_TRIAL_INTAKE_SECRET not set, refusing");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type SignupBody = { email?: unknown };

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const result = await enrollAppTrialLead(email, { source: "app-trial" });
  if (!result.ok) {
    // Say so rather than reporting success: the worker logs the failed forward,
    // and the lead is still safe in LEADS_KV either way.
    return NextResponse.json({ ok: false, error: "Enrollment failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    enrolled: result.enrolled,
    ...(result.created === undefined ? {} : { created: result.created }),
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
