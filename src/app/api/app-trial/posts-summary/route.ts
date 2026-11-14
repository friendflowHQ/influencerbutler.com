/**
 * POST /api/app-trial/posts-summary: the desktop app reports, once a day, how
 * many of a TRIAL user's own storefront posts have a live deal, a live
 * sale-event deal or an open Creator Connections campaign. Stored on their
 * existing app-trial row and used as one line in the day 12 email
 * (src/lib/app-trial-posts.ts).
 *
 * Unauthenticated on purpose (a trial user has no account), so it is built to
 * be harmless if spoofed: counts only (no links, names or free text), clamped;
 * only an existing, still-running app-trial row is updated (never creates or
 * enrolls anyone); rate-limited per IP and per email; and the answer is always
 * the same {ok:true}, so it never reveals whether an address is on our list.
 */
import { NextResponse } from "next/server";
import { normalizePostsSummary } from "@/lib/app-trial-posts";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function ipOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 200) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  const summary = normalizePostsSummary(body.counts);
  if (!summary) return NextResponse.json({ error: "Invalid counts" }, { status: 400 });

  const ipLimit = await rateLimit(`app-trial-posts:ip:${ipOf(request)}`, 30, 3600);
  const emailLimit = await rateLimit(`app-trial-posts:email:${email}`, 4, 24 * 3600);
  if (!ipLimit.allowed || !emailLimit.allowed) return NextResponse.json({ ok: true });

  try {
    // Only a running app trial: enrolled, not unsubscribed, not converted or
    // abandoned. A miss (or the columns not existing yet) is silent.
    const { error } = await createAdminClient()
      .from("email_subscribers")
      .update({ app_trial_posts_summary: summary, app_trial_posts_summary_at: new Date().toISOString() })
      .eq("email", email)
      .not("app_trial_started_at", "is", null)
      .is("unsubscribed_at", null)
      .is("app_trial_converted_at", null)
      .is("app_trial_abandoned_at", null);
    if (error) console.warn("app-trial posts-summary: update skipped", error.message);
  } catch (err) {
    console.warn("app-trial posts-summary: unavailable", err instanceof Error ? err.message : String(err));
  }
  return NextResponse.json({ ok: true });
}
