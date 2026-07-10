/**
 * Self-serve unsubscribe endpoint for the public /unsubscribe form.
 *
 * Unlike /api/email/unsubscribe (which verifies a signed per-recipient token
 * baked into automated funnel emails), this accepts a plain email address that
 * the visitor typed in. It backs the generic unsubscribe link used in
 * hand-sent Gmail outreach, where a static signature can't carry a per-person
 * token.
 *
 * Suppressing an arbitrary typed address is low-harm (worst case someone stops
 * receiving our outreach) and is the standard one-step unsubscribe pattern, so
 * we record it immediately with no confirmation email.
 */
import { NextResponse } from "next/server";
import { recordSuppression } from "@/lib/email-unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email = "";
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { email?: unknown };
      email = typeof body?.email === "string" ? body.email : "";
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "");
    }
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  email = email.trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const ok = await recordSuppression(email, "unsubscribe");
  if (!ok) {
    return NextResponse.json(
      { error: "Something went wrong. Email hello@influencerbutler.com and we'll remove you by hand." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
