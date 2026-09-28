/**
 * GET /api/extension/review/click?e=<email>&t=<token> - the tracked "Leave a
 * review" link from the nudge emails. Stamps review_clicked_at on the lifecycle
 * row (a strong proxy that the person went to review us) and 302s to the Chrome
 * Web Store review page.
 *
 * A missing/invalid token never blocks the redirect: we would rather send a
 * genuine user to the store than 400 them over a mangled link. We just skip the
 * stamp so a forged link cannot write lifecycle rows for arbitrary addresses.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { normalizeEmail } from "@/lib/email-unsubscribe";
import { CHROME_REVIEW_URL, verifyReviewToken } from "@/lib/extension-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToStore(): NextResponse {
  const res = NextResponse.redirect(CHROME_REVIEW_URL, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("e") ?? "");
  const token = url.searchParams.get("t") ?? "";

  if (email && verifyReviewToken(email, token)) {
    try {
      const db = createAdminClient();
      // Only stamp the first click; keep the earliest click time.
      const { data, error } = await db
        .from("extension_review_nudges")
        .select("email, review_clicked_at")
        .eq("email", email)
        .maybeSingle();
      if (error) {
        if (!isMissingTableError(error)) console.error("review click: read failed", error);
      } else if (data && !data.review_clicked_at) {
        await db
          .from("extension_review_nudges")
          .update({ review_clicked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("email", email);
      } else if (!data) {
        // Clicked from an email but no lifecycle row (e.g. captured before the
        // table existed): open one so the click is not lost.
        await db
          .from("extension_review_nudges")
          .insert({ email, review_clicked_at: new Date().toISOString() });
      }
    } catch (err) {
      console.error("review click: stamp threw", err);
    }
  }

  return redirectToStore();
}
