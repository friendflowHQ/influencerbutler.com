/**
 * Course progress save / resume.
 *
 * POST { email, seriesId, progress } - upserts the visitor's checkbox
 *   progress, records the email in email_subscribers (course lead capture),
 *   and emails a resume link. The resume email is deduped to one per hour per
 *   address. Always answers { ok: true } for valid input so the endpoint
 *   never leaks who is already saved.
 *
 * GET ?token=<uuid> - returns { ok, progress } looked up by resume_token
 *   only (never by email; no enumeration surface).
 *
 * localStorage remains the primary store; this is the optional cross-device
 * backup. Everything here is best-effort and degrades gracefully when the
 * table or Resend config is missing.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIES_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const MAX_PROGRESS_BYTES = 32 * 1024;

const COURSE_URLS: Record<string, string> = {
  "amazon-influencer-course": "https://www.influencerbutler.com/course/amazon-influencer",
};

// Loosely-typed service client, same pattern as /api/newsletter/subscribe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serviceDb(): any {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  });
}

async function recordSubscriber(email: string): Promise<void> {
  try {
    const db = serviceDb();
    if (!db) return;
    await db
      .from("email_subscribers")
      .upsert(
        { email, source: "course-amazon-influencer" },
        { onConflict: "email", ignoreDuplicates: true },
      );
  } catch (err) {
    console.error("course-progress: subscriber record failed", err);
  }
}

async function sendResumeEmail(email: string, seriesId: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const courseUrl = COURSE_URLS[seriesId];
  if (!apiKey || !courseUrl) return;
  const link = `${courseUrl}?resume=${token}`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Influencer Butler <hello@influencerbutler.com>",
        to: [email],
        subject: "Your course progress is saved: resume anytime",
        text: [
          "Your progress in the free Amazon Influencer course is saved.",
          "",
          `Resume on any device: ${link}`,
          "",
          "Keep this email; the link always brings back your latest saved progress.",
          "",
          "Influencer Butler",
        ].join("\n"),
      }),
    });
    if (!res.ok) console.error("course-progress: resume email failed", res.status);
  } catch (err) {
    console.error("course-progress: resume email threw", err);
  }
}

export async function POST(request: Request) {
  let body: { email?: unknown; seriesId?: unknown; progress?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const seriesId = typeof body.seriesId === "string" ? body.seriesId : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (!SERIES_RE.test(seriesId) || !COURSE_URLS[seriesId]) {
    return NextResponse.json({ error: "Unknown course." }, { status: 400 });
  }
  const progress = body.progress && typeof body.progress === "object" ? body.progress : null;
  if (!progress || JSON.stringify(progress).length > MAX_PROGRESS_BYTES) {
    return NextResponse.json({ error: "Invalid progress payload." }, { status: 400 });
  }

  const db = serviceDb();
  if (!db) return NextResponse.json({ ok: true, saved: false });

  try {
    const { data: existing } = await db
      .from("course_progress")
      .select("resume_token, updated_at")
      .eq("email", email)
      .eq("series", seriesId)
      .maybeSingle();

    const { error } = await db.from("course_progress").upsert(
      { email, series: seriesId, progress, updated_at: new Date().toISOString() },
      { onConflict: "email,series" },
    );
    if (error) {
      console.error("course-progress: upsert failed", error);
      return NextResponse.json({ ok: true, saved: false });
    }

    await recordSubscriber(email);

    // Fetch the token (fresh row) and send the resume email at most hourly.
    const { data: row } = await db
      .from("course_progress")
      .select("resume_token")
      .eq("email", email)
      .eq("series", seriesId)
      .maybeSingle();
    const token = row?.resume_token as string | undefined;
    const lastUpdated = existing?.updated_at ? Date.parse(String(existing.updated_at)) : 0;
    const recentlyEmailed = existing && Date.now() - lastUpdated < 60 * 60 * 1000;
    if (token && !recentlyEmailed) {
      await sendResumeEmail(email, seriesId, token);
    }
    return NextResponse.json({ ok: true, saved: true });
  } catch (err) {
    console.error("course-progress: save threw", err);
    return NextResponse.json({ ok: true, saved: false });
  }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  const db = serviceDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    const { data } = await db
      .from("course_progress")
      .select("progress, series")
      .eq("resume_token", token)
      .maybeSingle();
    if (!data) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json({ ok: true, series: data.series, progress: data.progress });
  } catch (err) {
    console.error("course-progress: lookup threw", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
