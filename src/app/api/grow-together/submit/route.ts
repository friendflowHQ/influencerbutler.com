/**
 * POST /api/grow-together/submit
 * Body: {
 *   email, token,                                  // signed submit link (required)
 *   chapterBody,                                   // required: the chapter itself
 *   handlesToInclude?, introEarn?, introInspired?, introLove?,
 *   concludeQuestion?, concludeAnswer?, ctaText?,
 *   headshotUrl?,                                  // set by the upload step
 *   name?, instagramHandle?, website?             // identity tweaks
 * }
 *
 * A contributor submitting (or re-submitting) their chapter through the signed,
 * no-login portal. Verifies the HMAC token (proves the link came from an email we
 * sent), then upserts the structured submission columns onto their
 * bundle_contributors row, marks them submitted, and emails a confirmation.
 *
 * Editable until the deadline: this overwrites the submission fields each time, so
 * a contributor can revise. Service-role client (the table is RLS-locked).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-send";
import { verifyBundleSubmitToken } from "@/lib/grow-together-submit";
import { BUNDLE_SLUG, BUNDLE_NAME } from "@/app/grow-together/_data/bundleMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = "Influencer Butler <hello@influencerbutler.com>";

type Body = Record<string, unknown>;

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (!email || !EMAIL_RE.test(email) || !token || !verifyBundleSubmitToken(email, token)) {
    return NextResponse.json({ error: "This submission link is not valid." }, { status: 403 });
  }

  const chapterBody = str(body.chapterBody, 20000);
  if (!chapterBody) {
    return NextResponse.json({ error: "Please write your chapter before submitting." }, { status: 400 });
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // The contributor must already exist (they applied). Look them up by email.
  let contributor: { id: string; name: string | null } | null = null;
  try {
    const { data, error } = await db
      .from("bundle_contributors")
      .select("id, name")
      .eq("bundle_slug", BUNDLE_SLUG)
      .ilike("email", email)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: "Submissions are not open yet." }, { status: 503 });
      }
      console.error("grow-together submit: lookup failed", error);
      return NextResponse.json({ error: "Could not save your chapter. Please retry." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "We could not find your application. Please apply first, then use the link we email you." },
        { status: 404 },
      );
    }
    contributor = { id: String(data.id), name: (data.name as string | null) ?? null };
  } catch (err) {
    console.error("grow-together submit: lookup threw", err);
    return NextResponse.json({ error: "Could not save your chapter. Please retry." }, { status: 500 });
  }

  const update: Record<string, unknown> = {
    chapter_body: chapterBody,
    handles_to_include: str(body.handlesToInclude, 300),
    intro_earn: str(body.introEarn, 2000),
    intro_inspired: str(body.introInspired, 2000),
    intro_love: str(body.introLove, 2000),
    conclude_question: str(body.concludeQuestion, 300),
    conclude_answer: str(body.concludeAnswer, 3000),
    cta_text: str(body.ctaText, 500),
    headshot_url: str(body.headshotUrl, 400),
    status: "submitted",
    submitted_at: new Date().toISOString(),
    submitted_via: "portal",
    updated_at: new Date().toISOString(),
  };
  // Optional identity tweaks (only overwrite when provided).
  const name = str(body.name, 120);
  if (name) update.name = name;
  const ig = str(body.instagramHandle, 80);
  if (ig) update.instagram_handle = ig;
  const website = str(body.website, 200);
  if (website) update.website = website;

  try {
    const { error } = await db.from("bundle_contributors").update(update).eq("id", contributor.id);
    if (error) {
      console.error("grow-together submit: update failed", error);
      return NextResponse.json({ error: "Could not save your chapter. Please retry." }, { status: 500 });
    }
  } catch (err) {
    console.error("grow-together submit: update threw", err);
    return NextResponse.json({ error: "Could not save your chapter. Please retry." }, { status: 500 });
  }

  // Confirmation email (transactional, best-effort: never fails the submit).
  try {
    const first = (contributor.name ?? "").split(/\s+/)[0] || "there";
    await sendEmail({
      from: FROM,
      to: email,
      subject: `Got it! Your ${BUNDLE_NAME} chapter is in`,
      text: `Hi ${first},

Thank you! We have received your chapter for the ${BUNDLE_NAME}. You are all set.

You can revise it any time before the deadline using the same link we emailed you. We will send launch-week details (graphics and ready-to-use captions) as we get closer.

Thank you for being part of this.

Liz Dean
The Social Media Posse`,
      category: "bundle_submission_confirm",
      funnel: "transactional",
    });
  } catch (err) {
    console.error("grow-together submit: confirmation email threw", err);
  }

  return NextResponse.json({ ok: true });
}
