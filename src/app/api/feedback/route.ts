/**
 * /api/feedback - public website support/feedback intake.
 *
 * POST: accepts a bug report, feature request, or question from the public
 *   /contact form and forwards it to the same Cloudflare feedback worker inbox
 *   the desktop Feedback panel submits to, so web-filed reports land in the
 *   standard support triage flow. This replaces the old "email
 *   hello@influencerbutler.com" support CTAs.
 *
 * The worker can optionally be gated by an x-ib-key shared secret
 * (FEEDBACK_SHARED_KEY) that must never reach the browser, so the form posts
 * here and this server route attaches the key when configured and forwards
 * either way (the worker only enforces the header if it has its own copy of
 * the secret set). Mirrors src/lib/support-worker.ts (submitSupportTicket)
 * and src/lib/ai-concierge/agent.ts (submitFeedback).
 *
 * Abuse control: the worker enforces a per-IP rate limit, this route adds its
 * own per-IP limit, and a Cloudflare Turnstile token is always verified. The
 * Turnstile check FAILS CLOSED in production when TURNSTILE_SECRET_KEY is unset
 * (see src/lib/turnstile.ts); outside production an unset secret is skipped so
 * local dev and keyless previews still work.
 */
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

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
  const limited = await rateLimit(`feedback:ip:${ip}`, 5, 3600);
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many messages from your network. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }
  const human = await verifyTurnstile(turnstileToken, ip);
  if (!human.ok) {
    return NextResponse.json(
      { ok: false, error: "Verification failed. Please try the checkbox again." },
      { status: 400 },
    );
  }

  const sharedKey = process.env.FEEDBACK_SHARED_KEY || "";
  // Always attach the shared key. If it is missing in production the worker
  // will (correctly) reject us; surface that loudly instead of silently
  // forwarding unauthenticated.
  if (!sharedKey && process.env.NODE_ENV === "production") {
    console.error("[api/feedback] FEEDBACK_SHARED_KEY is not set in production");
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-ib-key": sharedKey,
  };

  const base = (process.env.FEEDBACK_WORKER_URL || "https://feedback.influencerbutler.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers,
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
