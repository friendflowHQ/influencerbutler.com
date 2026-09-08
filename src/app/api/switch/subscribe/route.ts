/**
 * POST /api/switch/subscribe
 * Body: { email: string, website?: string }
 *
 * Email capture for /switch/fluencer-fruit. Mirrors /api/newsletter/subscribe
 * (validation, friendly always-200 result, graceful degradation) but instead of
 * a newsletter opt-in it:
 *   1. records the address in email_subscribers with source
 *      "fluencer-fruit-switch", unioning the fluencer-fruit-switch tag onto any
 *      existing tags (same shape as the admin contacts import), then
 *   2. fires enrollForTagAdded so the ACTIVE "Fluencer Fruit switch" sequence
 *      (trigger tag_added / fluencer-fruit-switch) enrolls it.
 *
 * "website" is a honeypot: the form hides it, bots fill it, and any value means
 * the submission is dropped (still 200 so the bot learns nothing).
 *
 * Suppression is honored up front: an address that has unsubscribed from
 * marketing email is neither re-tagged nor enrolled (the sender would refuse it
 * anyway; skipping here keeps the enrollment table honest). Duplicates and a
 * missing table both degrade to a friendly success so nothing leaks who is
 * already on the list.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";
import { enrollForTagAdded } from "@/lib/email-marketing";
import { SWITCH_SOURCE, SWITCH_TAG } from "@/lib/switch-fluencer-fruit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscribeBody = { email?: unknown; website?: unknown };

function serviceDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null; // service-role key not configured: degrade to a friendly no-op
  }
}

/**
 * Upserts the contact and unions the switch tag. Returns false when the table
 * is missing or the write failed (caller then skips enrollment).
 */
async function tagContact(db: SupabaseClient, email: string): Promise<boolean> {
  const { data: existing, error: readErr } = await db
    .from("email_subscribers")
    .select("email, tags")
    .eq("email", email)
    .maybeSingle();
  if (readErr) {
    console.error("switch/subscribe: contact read failed", readErr);
    return false;
  }

  if (!existing) {
    const { error: insertErr } = await db
      .from("email_subscribers")
      .insert({ email, source: SWITCH_SOURCE, tags: [SWITCH_TAG] });
    if (insertErr) {
      // A concurrent insert (23505) is fine: the row exists, carry on to enroll.
      const code = (insertErr as { code?: string }).code;
      if (code !== "23505") {
        console.error("switch/subscribe: contact insert failed", insertErr);
        return false;
      }
    }
    return true;
  }

  const tags = Array.isArray(existing.tags)
    ? existing.tags.filter((t: unknown): t is string => typeof t === "string")
    : [];
  if (tags.includes(SWITCH_TAG)) return true;

  const { error: updErr } = await db
    .from("email_subscribers")
    .update({ tags: [...tags, SWITCH_TAG] })
    .eq("email", email);
  if (updErr) {
    console.error("switch/subscribe: contact tag union failed", updErr);
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot filled: a bot. Pretend success and do nothing.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  // Reserved test domains can never receive mail; accept quietly, persist nothing.
  if (isUndeliverableTestEmail(email)) {
    return NextResponse.json({ ok: true });
  }

  // Opted out of marketing email: never re-tag or re-enroll. Still 200 so the
  // form does not reveal suppression status.
  if (await isEmailSuppressed(email)) {
    return NextResponse.json({ ok: true });
  }

  const db = serviceDb();
  if (db) {
    try {
      const tagged = await tagContact(db, email);
      if (tagged) await enrollForTagAdded(db, SWITCH_TAG, [email]);
    } catch (err) {
      console.error("switch/subscribe: threw", err);
    }
  }

  return NextResponse.json({ ok: true });
}
