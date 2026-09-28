// Enrolling someone on the app-trial drip, in one place.
//
// Two populations arrive here and both are on a 14-day trial with no card:
//   - desktop installs, forwarded by the licensing worker from the startup
//     walkthrough email capture (/api/app-trial/signup);
//   - no-card trials claimed on the download interstitial, which are granted as
//     an in-house comp (/api/trial/no-card).
//
// Neither creates a Lemon Squeezy subscription, so neither is visible to the
// trial funnel that runs off subscriptions.trial_started_at. Without this they
// get 14 days of silence and then a locked app.
//
// app_trial_started_at is the drip's anchor and is set once, never reset: a
// reinstall, a second claim, or a duplicate forward must not restart the
// sequence or re-send the welcome.

import { createAdminClient } from "@/lib/supabase/admin";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";

export type EnrollResult = {
  ok: boolean;
  enrolled: boolean;
  created?: boolean;
  reason?: "undeliverable" | "suppressed" | "unsubscribed" | "already" | "error";
};

export async function enrollAppTrialLead(
  rawEmail: string,
  opts: { source?: string } = {},
): Promise<EnrollResult> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email) return { ok: false, enrolled: false, reason: "error" };

  // Reserved test domains can never receive mail, so enrolling one would burn
  // the per-run send budget on an address that fails forever.
  if (isUndeliverableTestEmail(email)) {
    return { ok: true, enrolled: false, reason: "undeliverable" };
  }

  // Someone who asked to be removed does not go back on the list by installing
  // the app or claiming a trial.
  if (await isEmailSuppressed(email)) {
    return { ok: true, enrolled: false, reason: "suppressed" };
  }

  try {
    const db = createAdminClient();
    const { data: existing, error: readError } = await db
      .from("email_subscribers")
      .select("email,source,app_trial_started_at,unsubscribed_at")
      .eq("email", email)
      .maybeSingle();

    if (readError) {
      // Most likely the migration has not reached prod yet.
      console.error("app-trial enroll: lookup failed", readError);
      return { ok: false, enrolled: false, reason: "error" };
    }

    const nowIso = new Date().toISOString();

    if (!existing) {
      const { error: insertError } = await db.from("email_subscribers").insert({
        email,
        source: opts.source || "app-trial",
        app_trial_started_at: nowIso,
      });
      if (insertError) {
        console.error("app-trial enroll: insert failed", insertError);
        return { ok: false, enrolled: false, reason: "error" };
      }
      return { ok: true, enrolled: true, created: true };
    }

    if (existing.unsubscribed_at) {
      return { ok: true, enrolled: false, reason: "unsubscribed" };
    }

    if (existing.app_trial_started_at) {
      return { ok: true, enrolled: true, created: false, reason: "already" };
    }

    // Known address (newsletter, gated download) starting a trial now. Anchor
    // at today, not their original created_at, which would mature them straight
    // into the lapsed tail.
    const patch: Record<string, unknown> = { app_trial_started_at: nowIso };

    // A download-app lead who has now installed has done what that drip was
    // asking for, so close it out rather than running both sequences at once.
    if (String(existing.source ?? "") === "download-app") {
      patch.onboarding_converted_at = nowIso;
    }

    const { error: updateError } = await db
      .from("email_subscribers")
      .update(patch)
      .eq("email", email);
    if (updateError) {
      console.error("app-trial enroll: update failed", updateError);
      return { ok: false, enrolled: false, reason: "error" };
    }

    return { ok: true, enrolled: true, created: false };
  } catch (err) {
    console.error("app-trial enroll threw", err);
    return { ok: false, enrolled: false, reason: "error" };
  }
}
