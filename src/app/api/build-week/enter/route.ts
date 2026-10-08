/**
 * POST /api/build-week/enter
 * Body: {
 *   name, email,                                  // required
 *   ideaUrl?, ideaUrl2?, ideaSummary?, groupName?, // at least ideaUrl or ideaSummary
 *   keepPrivate?: boolean, updates?: boolean,
 *   agree: true,                                  // required: Official Rules + Privacy consent
 *   website?: string,                             // honeypot: any value means a bot
 *   turnstileToken: string
 * }
 *
 * The small eligibility / claim form behind the Build Week event. Ideas are
 * pitched in the Facebook group; this records who is behind them so the owner
 * can issue the lifetime-access guarantee if an idea is not built in time.
 *
 * Abuse controls (an email-sink, so anyone can type a victim's address):
 *  - 404 until NEXT_PUBLIC_BUILD_WEEK_ENABLED=1 (nothing is exposed pre-launch);
 *  - honeypot field, Turnstile (always required), per-IP and per-email rate limits;
 *  - a reserved test address is rejected; a duplicate entry is treated as success
 *    so the form never reveals who has already entered.
 *
 * The row (with the exact consent wording and Rules version) lives in
 * build_week_entries (RLS-locked, service role only). The event-updates box is a
 * separate, unticked opt-in: only then is the address tagged "build-week" and
 * enrolled in any tag_added sequence, and never if it has unsubscribed.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  BUILD_WEEK_CONSENT_TEXT,
  BUILD_WEEK_RULES_VERSION,
  BUILD_WEEK_SLUG,
  BUILD_WEEK_SOURCE,
  BUILD_WEEK_TAG,
  isBuildWeekEnabled,
} from "@/lib/build-week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES = ["en-US", "es-ES", "fr-FR"];
const FACEBOOK_HOST_RE = /(^|\.)facebook\.com$|(^|\.)fb\.com$/i;

type Body = {
  name?: unknown;
  email?: unknown;
  groupName?: unknown;
  ideaUrl?: unknown;
  ideaUrl2?: unknown;
  ideaSummary?: unknown;
  keepPrivate?: unknown;
  updates?: unknown;
  agree?: unknown;
  website?: unknown;
  turnstileToken?: unknown;
  locale?: unknown;
};

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

/** Trim to a max length, or null when absent/blank. */
function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** A link to a Facebook post/comment, or null. Returns "invalid" for anything else. */
function facebookLink(value: unknown): string | null | "invalid" {
  const raw = str(value, 500);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !FACEBOOK_HOST_RE.test(u.hostname)) return "invalid";
    return u.toString();
  } catch {
    return "invalid";
  }
}

export async function POST(request: Request) {
  if (!isBuildWeekEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot filled: a bot. Pretend success and do nothing.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const name = str(body.name, 120);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (body.agree !== true) {
    return NextResponse.json(
      { error: "Please agree to the Official Rules to continue." },
      { status: 400 },
    );
  }

  const ideaUrl = facebookLink(body.ideaUrl);
  const ideaUrl2 = facebookLink(body.ideaUrl2);
  if (ideaUrl === "invalid" || ideaUrl2 === "invalid") {
    return NextResponse.json(
      { error: "Please paste the link to your idea comment in the Facebook group." },
      { status: 400 },
    );
  }
  const ideaSummary = str(body.ideaSummary, 1500);
  if (!ideaUrl && !ideaSummary) {
    return NextResponse.json(
      { error: "Please add the link to your idea comment, or describe your idea." },
      { status: 400 },
    );
  }

  if (isUndeliverableTestEmail(email)) {
    return NextResponse.json(
      { error: "Please use a real email so we can reach you if you win." },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const human = await verifyTurnstile(token, ip);
  if (!human.ok) {
    return NextResponse.json(
      { error: "Verification failed. Please try the checkbox again." },
      { status: 400 },
    );
  }

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`build-week:ip:${ip}`, 10, 3600),
    rateLimit(`build-week:email:${email}`, 3, 86400),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec)) },
      },
    );
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const wantsUpdates = body.updates === true;
  // The consent record is the wording the entrant saw; note when it was shown in
  // another language (the English Rules are the binding text either way).
  const locale = typeof body.locale === "string" && LOCALES.includes(body.locale) ? body.locale : "en-US";
  const consentText =
    locale === "en-US"
      ? BUILD_WEEK_CONSENT_TEXT
      : `${BUILD_WEEK_CONSENT_TEXT} [shown to the entrant in ${locale}; the English Rules control]`;
  const row: Record<string, unknown> = {
    event_slug: BUILD_WEEK_SLUG,
    name,
    email,
    group_name: str(body.groupName, 120),
    idea_url: ideaUrl,
    idea_url_2: ideaUrl2,
    idea_summary: ideaSummary,
    keep_private: body.keepPrivate === true,
    wants_updates: wantsUpdates,
    rules_version: BUILD_WEEK_RULES_VERSION,
    consent_text: consentText,
  };

  try {
    const { error } = await db.from("build_week_entries").insert(row);
    if (error) {
      const code = (error as { code?: string }).code;
      // Already entered with this email: report success, reveal nothing.
      if (code === "23505") return NextResponse.json({ ok: true });
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: "Entries are not open just yet. Please check back shortly." },
          { status: 503 },
        );
      }
      console.error("build-week enter: insert failed", error);
      return NextResponse.json(
        { error: "Could not save your entry. Please retry." },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("build-week enter: insert threw", err);
    return NextResponse.json({ error: "Could not save your entry. Please retry." }, { status: 500 });
  }

  // Event-updates opt-in only, and never for an address that has unsubscribed.
  // Best-effort: the entry is already saved either way.
  if (wantsUpdates) {
    try {
      if (!(await isEmailSuppressed(email))) {
        await tagRecipientsAsContacts(db, [email], BUILD_WEEK_TAG, BUILD_WEEK_SOURCE);
      }
    } catch (err) {
      console.error("build-week enter: tag/enroll threw", err);
    }
  }

  return NextResponse.json({ ok: true });
}
