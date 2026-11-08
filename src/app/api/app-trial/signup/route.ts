/**
 * POST /api/app-trial/signup
 * Body: {
 *   email: string,
 *   first_name?: string | null,
 *   source?: string,                       // Worker lead source (informational)
 *   stage?: "capture" | "complete" | "backfill" | "milestone",
 *   profile?: OnboardingProfile,           // desktop walkthrough answers
 *   planLevelIntent?: "beginner" | "power" | ...,
 *   milestone?: "first-butler-run" | "extension-paired",
 * }
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
 *
 * Funnels v2 (all additive; an email-only body behaves exactly as before):
 *   - stage missing / "capture": enroll, then store the profile as wt-* tags
 *     and the desktop plan intent as the plan- tag (lowest-rank sources).
 *   - "complete": enroll (idempotent; covers a capture forward that failed),
 *     then store the profile. An automation-mode walkthrough that completed
 *     counts as activation.
 *   - "backfill": store the profile only. Never enrolls: these people finished
 *     the walkthrough long ago, and enrolling now would start a fresh 14-day
 *     drip for an app trial that ended months back.
 *   - "milestone": never enrolls; only records the activation signal.
 * Profile / plan / activation writes are best-effort and never change the
 * enrollment response.
 */
import { NextResponse } from "next/server";
import { enrollAppTrialLead } from "@/lib/app-trial-enroll";
import { verifyBearer } from "@/lib/auth-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyOnboardingProfile, parseOnboardingProfile } from "@/lib/onboarding-profile";
import { normalizePlanLevelIntent, resolvePlanLevel, syncPlanLevelTag } from "@/lib/plan-level";
import { isDesktopMilestone, markActivated } from "@/lib/funnel-activation";
import type { OnboardingProfile } from "@/lib/funnel-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAuthorized(request: Request): boolean {
  // Fails closed (and logs) when APP_TRIAL_INTAKE_SECRET is unset: this route
  // writes to the owned list and arms a send sequence.
  return verifyBearer(request, "APP_TRIAL_INTAKE_SECRET");
}

type SignupBody = {
  email?: unknown;
  stage?: unknown;
  profile?: unknown;
  planLevelIntent?: unknown;
  milestone?: unknown;
};

type Stage = "capture" | "complete" | "backfill" | "milestone";

function isStage(raw: unknown): raw is Stage {
  return raw === "capture" || raw === "complete" || raw === "backfill" || raw === "milestone";
}

/** The request's stage; when absent, the profile's own stage; else capture. */
function readStage(body: SignupBody): Stage {
  if (isStage(body.stage)) return body.stage;
  const inner = body.profile && typeof body.profile === "object" ? (body.profile as { stage?: unknown }).stage : undefined;
  if (inner === "complete" || inner === "backfill") return inner;
  return "capture";
}

/**
 * Best-effort profile + plan intent write. Returns whether a profile was
 * stored, or null when the body carried none. Never throws.
 */
async function applyProfileExtras(
  email: string,
  profile: OnboardingProfile | null,
  planLevelIntent: unknown,
): Promise<boolean | null> {
  const intent = normalizePlanLevelIntent(planLevelIntent);
  if (!profile && !intent) return null;
  try {
    const db = createAdminClient();
    let applied: boolean | null = null;
    if (profile) {
      const res = await applyOnboardingProfile(db, email, profile);
      applied = res.ok && !res.reason;
    }
    // Intent beats inference; both rank below LS and comp, and the rank guard
    // inside syncPlanLevelTag keeps a real purchase from being overwritten.
    const plan = resolvePlanLevel({ intent, profile });
    if (plan) await syncPlanLevelTag(db, email, plan.level, plan.source);
    if (
      profile &&
      profile.stage === "complete" &&
      profile.outcome === "complete" &&
      profile.mode === "automation"
    ) {
      await markActivated(email, "walkthrough-auto-complete", { db, source: "intake" });
    }
    return applied;
  } catch (err) {
    console.error("app-trial signup: profile extras failed", err);
    return profile ? false : null;
  }
}

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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const stage = readStage(body);

  // Milestone beacons never enroll: they only prove the app is being used.
  if (stage === "milestone") {
    if (!isDesktopMilestone(body.milestone)) {
      return NextResponse.json({ ok: false, error: "Invalid milestone" }, { status: 400 });
    }
    const res = await markActivated(email, body.milestone, { source: "intake" });
    return NextResponse.json({ ok: true, milestone: body.milestone, recorded: res.ok });
  }

  // The request stage wins over a stage inside the profile, so a "complete"
  // forward is always stored as a completion.
  const parsed = parseOnboardingProfile(body.profile, stage);
  const profile: OnboardingProfile | null = parsed ? { ...parsed, stage } : null;

  if (stage === "backfill") {
    const applied = await applyProfileExtras(email, profile, body.planLevelIntent);
    return NextResponse.json({ ok: true, enrolled: false, reason: "backfill", profileApplied: applied === true });
  }

  // A walkthrough completion ping is a profile update, never a signup: the
  // desktop sends it whenever someone finishes a walkthrough (often months
  // after install, and the Worker forwards it without the capture-source
  // gate). Enrolling here would start a fresh 14-day app-trial drip for a
  // long-standing free or comped user. The profile only lands on an existing
  // contact (applyOnboardingProfile never creates one); new leads enroll
  // through their capture forward.
  if (stage === "complete") {
    const applied = await applyProfileExtras(email, profile, body.planLevelIntent);
    return NextResponse.json({
      ok: true,
      enrolled: false,
      reason: "profile-only",
      ...(profile ? { profileApplied: applied === true } : {}),
    });
  }

  const result = await enrollAppTrialLead(email, { source: "app-trial" });
  if (!result.ok) {
    // Say so rather than reporting success: the worker logs the failed forward,
    // and the lead is still safe in LEADS_KV either way.
    return NextResponse.json({ ok: false, error: "Enrollment failed" }, { status: 503 });
  }

  // Suppressed / reserved-domain addresses have no contact row worth tagging.
  const skipExtras = result.reason === "suppressed" || result.reason === "undeliverable";
  const applied = skipExtras ? null : await applyProfileExtras(email, profile, body.planLevelIntent);

  return NextResponse.json({
    ok: true,
    enrolled: result.enrolled,
    ...(result.created === undefined ? {} : { created: result.created }),
    ...(result.reason ? { reason: result.reason } : {}),
    ...(profile ? { profileApplied: applied === true } : {}),
  });
}
