import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInHouseComp } from "@/lib/comp-issue";
import { isBotUserAgent } from "@/lib/affiliate-clicks";
import { AFFILIATE_COMP_PLAN, AFFILIATE_COMP_SEATS } from "@/lib/affiliate-comps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/trial/no-card
 *
 * Self-serve, no-credit-card 14-day Pro trial. Mints an in-house comp (Pro
 * unlocked entirely in Supabase, no Lemon Squeezy subscription) and emails the
 * recipient their license key + download + an upgrade link. Lowers the paid
 * funnel's barrier: the only "real" trial requires a card at LS checkout, which
 * is why so few free-app downloaders ever start one.
 *
 * ABUSE POSTURE: this gives away free Pro to anyone with an email, so it is
 * gated behind NO_CARD_TRIAL_ENABLED (default off - ships dark) and guarded by:
 *   - one trial per email, ever (any prior comp_grant blocks a repeat);
 *   - issueInHouseComp's own "no stacking on a live subscription" guard;
 *   - a bot user-agent filter and POST-only (crawlers / prefetch can't trigger it);
 *   - the key is delivered by EMAIL only, never shown on the page, so an abuser
 *     needs a real inbox per claim.
 * If abuse appears after enabling, add a captcha or email-verification step. The
 * 14-day window auto-cancels via the existing comp-expiry cron, so no card is
 * ever charged.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRIAL_DAYS = 14;

/** Escape PostgREST ilike wildcards so an email is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Has this email ever been given a comp (active, expired, or cancelled)? */
async function hasAnyComp(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("comp_grants")
    .select("id", { count: "exact", head: true })
    .ilike("user_email", escapeLike(email));
  if (error) {
    // Fail closed: if we cannot confirm this is a first-time recipient, refuse.
    console.error("trial/no-card: duplicate check failed", error);
    return true;
  }
  return (count ?? 0) > 0;
}

/** Reads the first-touch affiliate code cookie so a later upgrade is attributed. */
function affiliateCodeFromCookies(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "ib_aff_src") {
      const val = decodeURIComponent(rest.join("=") || "").trim();
      return val.length > 0 && val.length <= 40 ? val : null;
    }
  }
  return null;
}

export async function POST(request: Request) {
  // Feature flag: dark until deliberately enabled in Vercel.
  if (process.env.NO_CARD_TRIAL_ENABLED !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Bots / crawlers / link-preview fetchers must never mint a comp.
  if (isBotUserAgent(request.headers.get("user-agent"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { email?: unknown; name?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  const name =
    typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim().slice(0, 80) : null;

  const admin = createAdminClient();

  // One free trial per email, ever.
  if (await hasAnyComp(admin, email)) {
    return NextResponse.json(
      {
        error:
          "It looks like this email has already used a free Pro trial. Start Pro any time from the pricing page.",
      },
      { status: 409 },
    );
  }

  const siteUrl = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
  const affCode = affiliateCodeFromCookies(request);
  const convertLink = affCode
    ? `${siteUrl}/pricing?code=${encodeURIComponent(affCode)}`
    : `${siteUrl}/pricing`;

  const result = await issueInHouseComp({
    email,
    name,
    months: null,
    days: TRIAL_DAYS,
    plan: AFFILIATE_COMP_PLAN, // Solo Pro
    seats: AFFILIATE_COMP_SEATS, // 1 device
    forever: false,
    allowExisting: false,
    convertLink,
  });

  if (!result.ok) {
    // 409 = already has a live subscription (issueInHouseComp guard); surface as-is.
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt });
}
