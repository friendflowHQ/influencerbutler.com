/**
 * /api/feedback - public website support/feedback intake.
 *
 * POST: accepts a bug report, feature request, or question from the public
 *   /contact form and forwards it to the same Cloudflare feedback worker inbox
 *   the desktop Feedback panel submits to, so web-filed reports land in the
 *   standard support triage flow. This replaces the old "email
 *   hello@influencerbutler.com" support CTAs.
 *
 * The worker is gated by an x-ib-key shared secret (FEEDBACK_SHARED_KEY) that
 * must never reach the browser, so the form posts here and this server route
 * attaches the key and forwards. Mirrors src/lib/ai-concierge/agent.ts
 * (submitFeedback).
 *
 * Abuse control: the worker enforces a per-IP rate limit, and this route
 * additionally verifies a Cloudflare Turnstile token when TURNSTILE_SECRET_KEY
 * is configured. If the secret is not set (e.g. a preview deploy without keys),
 * verification is skipped so the form still works.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["bug", "feature", "question"]);
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 8000;
const EMAIL_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PostBody = {
  type?: string;
  title?: string;
  description?: string;
  userEmail?: string;
  turnstileToken?: string;
};

function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    ""
  );
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  // No secret configured -> skip verification so the form stays usable.
  if (!secret) return true;
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form },
    );
    const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return Boolean(json?.success);
  } catch (err) {
    console.error("[api/feedback] turnstile verify threw", err);
    return false;
  }
}

export async function POST(request: Request) {
  let payload: PostBody;
  try {
    payload = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const type = (payload.type ?? "").trim().toLowerCase();
  const title = (payload.title ?? "").trim();
  const description = (payload.description ?? "").trim();
  const userEmail = (payload.userEmail ?? "").trim();
  const turnstileToken = (payload.turnstileToken ?? "").trim();

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json(
      { ok: false, error: "Pick a topic (bug, feature, or question)." },
      { status: 400 },
    );
  }
  if (!title || title.length > TITLE_MAX) {
    return NextResponse.json(
      { ok: false, error: `A short subject is required (max ${TITLE_MAX} characters).` },
      { status: 400 },
    );
  }
  if (description.length > DESCRIPTION_MAX) {
    return NextResponse.json(
      { ok: false, error: `Message is too long (max ${DESCRIPTION_MAX} characters).` },
      { status: 400 },
    );
  }
  if (userEmail && (userEmail.length > EMAIL_MAX || !EMAIL_RE.test(userEmail))) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email so we can reply, or leave it blank." },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const humanOk = await verifyTurnstile(turnstileToken, ip);
  if (!humanOk) {
    return NextResponse.json(
      { ok: false, error: "Verification failed. Please try the checkbox again." },
      { status: 400 },
    );
  }

  const sharedKey = process.env.FEEDBACK_SHARED_KEY || "";
  if (!sharedKey) {
    console.error("[api/feedback] FEEDBACK_SHARED_KEY is not set");
    return NextResponse.json(
      { ok: false, error: "Support intake is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const base = (process.env.FEEDBACK_WORKER_URL || "https://feedback.influencerbutler.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ib-key": sharedKey },
      body: JSON.stringify({
        type,
        title,
        description: `${description}\n\n[Filed via website contact form]`,
        userEmail,
        platform: "website",
        submittedAt: new Date().toISOString(),
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
    if (!res.ok || !json?.ok) {
      console.error("[api/feedback] worker submit failed", res.status, json);
      return NextResponse.json(
        { ok: false, error: json?.error || "Could not send your message right now. Please try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, id: json.id ?? null });
  } catch (err) {
    console.error("[api/feedback] worker submit threw", err);
    return NextResponse.json(
      { ok: false, error: "Could not send your message right now. Please try again." },
      { status: 502 },
    );
  }
}
