/**
 * POST /api/newsletter/subscribe
 * Body: { email: string, source?: string }
 *
 * Captures a newsletter opt-in. Records it in email_subscribers (the local
 * record of truth) and, when a Resend Audience is configured, best-effort adds
 * the contact there too so issues can be composed and sent from the Resend
 * dashboard (unsubscribe + compliance handled by Resend).
 *
 * Always returns a friendly result: a duplicate email is treated as success so
 * we never leak who is already on the list, and a missing table / missing
 * Resend config degrades gracefully instead of erroring at the visitor.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscribeBody = { email?: unknown; source?: unknown };

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

/**
 * Best-effort: add the contact to the Resend newsletter segment. Never throws.
 * RESEND_AUDIENCE_ID holds a Resend *segment* id (Resend renamed Audiences to
 * Segments); the current contacts API is POST /contacts with a `segments` array.
 */
async function addToResendAudience(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !segmentId) return;
  try {
    const res = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false, segments: [segmentId] }),
    });
    if (!res.ok) {
      console.error("newsletter: Resend contact add failed", res.status);
    }
  } catch (err) {
    console.error("newsletter: Resend contact add threw", err);
  }
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
