/**
 * GET /api/email/path?e=<email>&p=beginner|creator&t=<token> - the "choose your
 * path" self-select link from the Dani Austin giveaway welcome drip. The reader
 * tells us which they are (starting from zero vs. already has a following) by
 * clicking, and we route them into the matching funnel.
 *
 * Effect (idempotent): tag the address ib-beginner or ib-creator, which
 * auto-enrolls them into that branch sequence (via tagRecipientsAsContacts ->
 * enrollForTagAdded, over ACTIVE sequences only), and cancel their open welcome
 * enrollment so the universal drip stops. Always ends by 302-redirecting to a
 * helpful page for the chosen path. GET (not POST) so a plain email link works,
 * matching the one-click unsubscribe and extension-review endpoints.
 *
 * A missing/invalid token never mutates state: a forged link cannot tag or
 * enroll arbitrary addresses. We still redirect so a mangled link is not a
 * dead end.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/email-unsubscribe";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import {
  DANI_WELCOME_SEQUENCE_ID,
  PATH_LANDING,
  PATH_SELECT_SOURCE,
  PATH_TAGS,
  isFunnelPath,
  verifyPathSelectToken,
} from "@/lib/email-path-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function landing(path: string): NextResponse {
  const base = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
  const res = NextResponse.redirect(`${base}${path}`, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("e") ?? "");
  const rawPath = url.searchParams.get("p") ?? "";
  const token = url.searchParams.get("t") ?? "";

  // Unknown path: nothing we can route them to; send them to the free course.
  if (!isFunnelPath(rawPath)) {
    return landing("/course/amazon-influencer");
  }

  // Bad or forged link: land them somewhere useful, but change nothing.
  if (!email || !verifyPathSelectToken(email, rawPath, token)) {
    return landing(PATH_LANDING[rawPath]);
  }

  try {
    const db = createAdminClient();

    // Tag + create-contact-if-missing + fire tag_added auto-enrollment. This is
    // the single call that enrolls them into the matching branch sequence (only
    // if that sequence is active, so activate the branches before sending).
    await tagRecipientsAsContacts(db, [email], PATH_TAGS[rawPath], PATH_SELECT_SOURCE);

    // Stop the universal welcome drip so they are not double-dripped now that
    // they have chosen a track. Same guard the review-confirm route uses.
    await db
      .from("email_sequence_enrollments")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("sequence_id", DANI_WELCOME_SEQUENCE_ID)
      .eq("email", email)
      .is("cancelled_at", null)
      .is("completed_at", null);
  } catch (err) {
    console.error("email path select: threw", err);
  }

  return landing(PATH_LANDING[rawPath]);
}
