/**
 * POST /api/app-trial/signup
 * Body: { email: string, first_name?: string | null }
 * Auth: Bearer APP_TRIAL_INTAKE_SECRET
 *
 * Server-to-server intake for desktop-app trial leads: the address someone
 * typed into the startup walkthrough. The licensing worker forwards it here
 * (workers/licensing/src/routes/leads.js#forwardToLifecycle) so the shared
 * secret never ships inside the desktop app.
 *
 * Before this existed the forward pointed at a lifecycle worker that was never
 * deployed, so an app-trial user got no email at all: their 14-day trial ended
 * and the app simply locked. Stamping app_trial_started_at here enrolls them in
 * the apptrial drip run by /api/cron/affiliate-funnel.
 *
 * Idempotent by design. app_trial_started_at is set once and never reset, so a
 * reinstall (or a duplicate forward) cannot restart the sequence or re-send the
 * welcome.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE = "app-trial";

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

type SignupBody = { email?: unknown; first_name?: unknown; firstName?: unknown };

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

  // Reserved test domains can never receive mail, so enrolling one would burn
  // the per-run send budget on an address that fails forever. Accept quietly.
  if (isUndeliverableTestEmail(email)) {
    return NextResponse.json({ ok: true, enrolled: false, reason: "undeliverable" });
  }

  // Someone who has asked to be removed does not get put back on the list by
  // installing the app.
  if (await isEmailSuppressed(email)) {
    return NextResponse.json({ ok: true, enrolled: false, reason: "suppressed" });
  }

  let db;
  try {
    db = createAdminClient();
  } catch (err) {
    console.error("app-trial signup: admin client unavailable", err);
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const { data: existing, error: readError } = await db
      .from("email_subscribers")
      .select("email,source,app_trial_started_at,unsubscribed_at")
      .eq("email", email)
      .maybeSingle();

    if (readError) {
      // Most likely the migration has not been applied to prod yet. Say so
      // rather than pretending the lead was enrolled.
      console.error("app-trial signup: lookup failed", readError);
      return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 503 });
    }

    if (!existing) {
      const nowIso = new Date().toISOString();
      const { error: insertError } = await db
        .from("email_subscribers")
        .insert({ email, source: SOURCE, app_trial_started_at: nowIso });
      if (insertError) {
        console.error("app-trial signup: insert failed", insertError);
        return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 503 });
      }
      return NextResponse.json({ ok: true, enrolled: true, created: true });
    }

    if (existing.unsubscribed_at) {
      return NextResponse.json({ ok: true, enrolled: false, reason: "unsubscribed" });
    }

    // Already enrolled: a reinstall or a duplicate forward must not restart the
    // drip or re-send the welcome.
    if (existing.app_trial_started_at) {
      return NextResponse.json({ ok: true, enrolled: true, created: false });
    }

    // Known address (newsletter signup, gated download) installing for the
    // first time. Anchor the drip at today rather than at their original
    // created_at, which would mature them straight into the lapsed tail.
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { app_trial_started_at: nowIso };

    // A download-app lead who has now installed has done what that drip was
    // asking for, so close it out instead of running both sequences at once.
    if (String(existing.source ?? "") === "download-app") {
      patch.onboarding_converted_at = nowIso;
    }

    const { error: updateError } = await db
      .from("email_subscribers")
      .update(patch)
      .eq("email", email);
    if (updateError) {
      console.error("app-trial signup: update failed", updateError);
      return NextResponse.json({ ok: false, error: "Update failed" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, enrolled: true, created: false });
  } catch (err) {
    console.error("app-trial signup threw", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
