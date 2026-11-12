/**
 * GET /api/cron/newsletter
 *
 * Weekly educational newsletter scheduler. Each run, if at least ~a week has
 * passed since the last issue, sends the next unsent issue from
 * NEWSLETTER_ISSUES to the Resend Audience and advances the pointer. Runs once
 * a week (see vercel.json); the gap check + immediate state write make it
 * idempotent against retries.
 *
 * Safe by default: sends nothing until RESEND_AUDIENCE_ID is configured, so it
 * is a no-op until the owner deliberately wires up the audience. Gated on
 * CRON_SECRET like the other crons. Add ?dry=1 to see what WOULD send without
 * sending or advancing state.
 */
import { NextResponse } from "next/server";
import {
  readNewsletterState,
  writeNewsletterState,
  sendNewsletterBroadcast,
  nextIssueIndex,
  NEWSLETTER_ISSUES,
} from "@/lib/newsletter";
import { verifyBearer } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Slightly under 7 days so a weekly cron never skips a week on timing jitter.
const MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

const PUSH_QUIET_FROM = Date.parse("2026-11-12T08:00:00Z");
const PUSH_QUIET_UNTIL = Date.parse("2026-12-01T08:00:00Z");
function newsletterPausedForPush(now: number = Date.now()): boolean {
  return now >= PUSH_QUIET_FROM && now < PUSH_QUIET_UNTIL;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const configured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
  if (!configured && !dry) {
    return NextResponse.json({ ok: true, sent: false, reason: "not-configured" });
  }

  // The weekly newsletter is a Resend Broadcast to the whole list, so it cannot
  // honour the one-email-a-day rule per person. It sits out the price lock push
  // (Nov 12 - Nov 30 2026, Pacific) and resumes on its own after.
  if (!dry && newsletterPausedForPush()) {
    return NextResponse.json({ ok: true, sent: false, reason: "price-lock-push" });
  }

  const state = await readNewsletterState();
  if (!state.enabled) {
    return NextResponse.json({ ok: true, sent: false, reason: "disabled" });
  }

  if (state.lastSentAt) {
    const elapsed = Date.now() - new Date(state.lastSentAt).getTime();
    if (Number.isFinite(elapsed) && elapsed < MIN_GAP_MS) {
      return NextResponse.json({ ok: true, sent: false, reason: "too-soon" });
    }
  }

  const idx = nextIssueIndex(state);
  if (idx === null) {
    return NextResponse.json({ ok: true, sent: false, reason: "complete" });
  }

  const issue = NEWSLETTER_ISSUES[idx];

  if (dry) {
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: "dry-run",
      wouldSend: { index: idx, subject: issue.subject },
      configured,
      total: NEWSLETTER_ISSUES.length,
    });
  }

  const result = await sendNewsletterBroadcast(issue);
  if (!result.ok) {
    return NextResponse.json({ ok: false, sent: false, reason: "send-failed", index: idx });
  }

  const sentAt = new Date().toISOString();
  await writeNewsletterState({
    enabled: true,
    lastSentIndex: idx,
    lastSentAt: sentAt,
    broadcasts: [
      ...state.broadcasts,
      ...(result.broadcastId
        ? [{ index: idx, id: result.broadcastId, subject: issue.subject, sentAt }]
        : []),
    ],
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    index: idx,
    subject: issue.subject,
    remaining: NEWSLETTER_ISSUES.length - (idx + 1),
  });
}
