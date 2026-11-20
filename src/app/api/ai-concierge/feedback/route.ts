/**
 * POST /api/ai-concierge/feedback  { rating: "up"|"down", reason?, question?, answer?, surface?, page?, locale? }
 * One thumbs up/down on a Butler AI answer. Dual-mode auth (website cookie or
 * license bearer) so the website bubble and the extension share it. Best-effort:
 * if the table is not applied yet it logs and still returns ok, so the UI never
 * shows an error for a feedback tap.
 *
 * Dependencies: @/lib/license-auth, @/lib/rate-limit, @/lib/scheduling-server.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAdmin } from "@/lib/scheduling-server";
import { normalizeChatLocale } from "@/lib/ai-concierge/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEEDBACK_LIMIT = 60;
const FEEDBACK_WINDOW_SEC = 3600;

function clip(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(request: Request) {
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const limited = await rateLimit(`ai-concierge-feedback:user:${authed.auth.userId}`, FEEDBACK_LIMIT, FEEDBACK_WINDOW_SEC);
  if (!limited.allowed) return NextResponse.json({ ok: true });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
  if (!rating) return NextResponse.json({ error: "rating must be up or down" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) {
    console.error("[ai-concierge/feedback] no admin client - feedback not logged");
    return NextResponse.json({ ok: true });
  }
  try {
    const { error } = await admin.from("ai_concierge_feedback").insert({
      user_id: authed.auth.userId,
      surface: clip(body.surface, 40),
      rating,
      reason: clip(body.reason, 500),
      question: clip(body.question, 1000),
      answer: clip(body.answer, 4000),
      page: clip(body.page, 200),
      locale: normalizeChatLocale(body.locale) ?? null,
    });
    if (error) console.error("[ai-concierge/feedback] insert", error.message);
  } catch (err) {
    console.error("[ai-concierge/feedback] threw", err);
  }
  return NextResponse.json({ ok: true });
}
