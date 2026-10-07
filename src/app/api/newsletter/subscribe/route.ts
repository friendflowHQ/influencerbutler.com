/**
 * POST /api/newsletter/subscribe
 * Body: { email: string, source?: string }
 *
 * Captures a newsletter opt-in. Records it in email_subscribers (the local
 * record of truth) and, when a Resend Audience is configured, best-effort adds
 * the contact there too so issues can be composed and sent from the Resend
 * dashboard (unsubscribe + compliance handled by Resend).
 *
 * Abuse control (this is an email-sink: anyone can type a victim's address):
 *  - per-IP and per-email rate limits (src/lib/rate-limit.ts);
 *  - Turnstile is verified whenever a token is sent, and REQUIRED when
 *    NEWSLETTER_REQUIRE_TURNSTILE=1 (turn on once every form that posts here
 *    renders the widget; today only NewsletterSignup does).
 *  - There is no double opt-in yet (needs a product decision: confirmation
 *    email + pending status in email_subscribers).
 *
 * Always returns a friendly result: a duplicate email is treated as success so
 * we never leak who is already on the list, and a missing table / missing
 * Resend config degrades gracefully instead of erroring at the visitor.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { addToResendAudience } from "@/lib/resend-audience";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscribeBody = { email?: unknown; source?: unknown; turnstileToken?: unknown };

type ServiceDb = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string; ignoreDuplicates?: boolean },
    ) => Promise<{ error: unknown }>;
  };
};

function serviceDb(): ServiceDb | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  }) as unknown as ServiceDb;
}

export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const ip = clientIp(request);
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (token || process.env.NEWSLETTER_REQUIRE_TURNSTILE === "1") {
    const human = await verifyTurnstile(token, ip);
    if (!human.ok) {
      return NextResponse.json(
        { error: "Verification failed. Please try the checkbox again." },
        { status: 400 },
      );
    }
  }

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`newsletter:ip:${ip}`, 10, 3600),
    rateLimit(`newsletter:email:${email}`, 3, 86400),
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

  // Reserved test domains (example.com, *.test, ...) can never receive mail, so
  // storing one would seed the newsletter/onboarding send pools with an address
  // that fails every send forever. Accept quietly (a test/probe still sees 200)
  // but do not persist or add to the audience.
  if (isUndeliverableTestEmail(email)) {
    return NextResponse.json({ ok: true });
  }

  const source =
    typeof body.source === "string" && body.source.length <= 60 ? body.source : "site";

  const db = serviceDb();
  if (db) {
    try {
      const { error } = await db.from("email_subscribers").upsert(
        { email, source },
        { onConflict: "email", ignoreDuplicates: true },
      );
      if (error) console.error("newsletter: upsert failed", error);
    } catch (err) {
      console.error("newsletter: upsert threw", err);
    }
  }

  await addToResendAudience(email);

  return NextResponse.json({ ok: true });
}
