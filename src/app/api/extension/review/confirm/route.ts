/**
 * GET /api/extension/review/confirm?e=<email>&t=<token> - the "already left a
 * review? tell us" self-report link from the nudge emails. This is the honest
 * stand-in for a Web Store review signal (Chrome exposes none): the recipient
 * tells us they reviewed us, and we take them at their word.
 *
 * Effect (idempotent, first time only): stamp review_left_at on the lifecycle
 * row, cancel their enrollment in the review sequence so the drip stops, and
 * send a one-time thank-you. Always ends by redirecting to the /extension-review
 * thank-you page. GET (not POST) so a plain email link works, matching the
 * one-click unsubscribe endpoint.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { normalizeEmail } from "@/lib/email-unsubscribe";
import { sendEmail } from "@/lib/email-send";
import { MARKETING_FROM } from "@/lib/email-marketing";
import { EXT_REVIEW_SEQUENCE_ID, verifyReviewToken } from "@/lib/extension-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function landing(done: boolean): NextResponse {
  const base =
    (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com").replace(
      /\/$/,
      "",
    );
  const res = NextResponse.redirect(`${base}/extension-review${done ? "?done=1" : ""}`, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

async function sendThankYou(email: string): Promise<void> {
  try {
    await sendEmail({
      from: MARKETING_FROM,
      to: email,
      subject: "Thank you for the review",
      text: [
        "Hi,",
        "",
        "It is Liz. Thank you so much for taking the time to review Influencer Butler. Reviews from real creators are what help other people find the extension, and it genuinely makes our day.",
        "",
        "That is the last you will hear from me about reviews. If you ever hit a snag or have an idea for the extension, just reply to this email.",
        "",
        "Liz",
        "The Social Media Posse",
      ].join("\n"),
      category: "ext_review_thanks",
      funnel: "transactional",
    });
  } catch (err) {
    console.error("review confirm: thank-you send threw", err);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("e") ?? "");
  const token = url.searchParams.get("t") ?? "";

  if (!email || !verifyReviewToken(email, token)) {
    // Bad or forged link: show the neutral landing page, change nothing.
    return landing(false);
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return landing(true);
  }

  try {
    // Read first so the thank-you and the cancel only fire on the first confirm.
    const { data, error } = await db
      .from("extension_review_nudges")
      .select("email, review_left_at")
      .eq("email", email)
      .maybeSingle();

    const alreadyLeft = !error && data ? Boolean(data.review_left_at) : false;
    const now = new Date().toISOString();

    if (error && !isMissingTableError(error)) {
      console.error("review confirm: lifecycle read failed", error);
    }

    if (!alreadyLeft) {
      // Stamp the lifecycle row (insert if it was captured before the table).
      if (!error) {
        if (data) {
          await db
            .from("extension_review_nudges")
            .update({ review_left_at: now, updated_at: now })
            .eq("email", email);
        } else {
          await db.from("extension_review_nudges").insert({ email, review_left_at: now });
        }
      }

      // Stop the drip: cancel this address's open enrollment in the review seq.
      await db
        .from("email_sequence_enrollments")
        .update({ cancelled_at: now })
        .eq("sequence_id", EXT_REVIEW_SEQUENCE_ID)
        .eq("email", email)
        .is("cancelled_at", null)
        .is("completed_at", null);

      await sendThankYou(email);
    }
  } catch (err) {
    console.error("review confirm: threw", err);
  }

  return landing(true);
}
