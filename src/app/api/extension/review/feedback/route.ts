/**
 * Extension feedback survey (earns the 99%-off-first-month reward).
 *
 *   GET  /api/extension/review/feedback?e=<email>&t=<token>
 *        -> { ok, completed, code, percent } (validate the signed link + status)
 *   POST /api/extension/review/feedback  { e, t, rating, use, feedback }
 *        -> records the answers, mints a per-user discount, returns { ok, code, percent }
 *
 * COMPLIANCE: the reward is for completing this feedback survey, full stop. It
 * is never contingent on the Web Store review (which is asked for separately,
 * with no reward). Rewarding a review would violate Chrome Web Store + FTC
 * policy. Do not couple the two here or in the email copy.
 *
 * The HMAC-signed link is the whole authorization (same scheme as the review
 * links and the one-click unsubscribe), so no login and no per-send token row.
 * Called same-origin from the /extension-feedback page, so no CORS.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { normalizeEmail } from "@/lib/email-unsubscribe";
import { EXT_REVIEW_DISCOUNT_PERCENT, verifyReviewToken } from "@/lib/extension-review";
import { mintFeedbackReward } from "@/lib/extension-review-discount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USE_MAX = 300;
const FEEDBACK_MAX = 2000;

type LifecycleRow = {
  email: string;
  survey_completed_at: string | null;
  discount_code: string | null;
};

function readLink(url: URL): { email: string; token: string } {
  return {
    email: normalizeEmail(url.searchParams.get("e") ?? ""),
    token: url.searchParams.get("t") ?? "",
  };
}

async function readRow(db: SupabaseClient, email: string): Promise<LifecycleRow | null | "missing-table"> {
  const { data, error } = await db
    .from("extension_review_nudges")
    .select("email, survey_completed_at, discount_code")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return "missing-table";
    console.error("review feedback: row read failed", error);
    return null;
  }
  return (data as LifecycleRow | null) ?? null;
}

export async function GET(request: Request) {
  const { email, token } = readLink(new URL(request.url));
  if (!email || !verifyReviewToken(email, token)) {
    return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }

  const row = await readRow(db, email);
  if (row === "missing-table") {
    // Table not applied yet: treat as a fresh, answerable survey so the page works.
    return NextResponse.json({ ok: true, completed: false });
  }
  const completed = Boolean(row?.survey_completed_at);
  return NextResponse.json({
    ok: true,
    completed,
    code: completed ? row?.discount_code ?? null : null,
    percent: EXT_REVIEW_DISCOUNT_PERCENT,
  });
}

type PostBody = { e?: unknown; t?: unknown; rating?: unknown; use?: unknown; feedback?: unknown };

function clampRating(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeEmail(typeof body.e === "string" ? body.e : "");
  const token = typeof body.t === "string" ? body.t : "";
  if (!email || !verifyReviewToken(email, token)) {
    return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }

  const existing = await readRow(db, email);
  if (existing === "missing-table") {
    return NextResponse.json({ ok: false, error: "Not available yet" }, { status: 503 });
  }

  // Idempotent: a second submit just returns the code already minted.
  if (existing?.survey_completed_at) {
    return NextResponse.json({
      ok: true,
      alreadyCompleted: true,
      code: existing.discount_code ?? null,
      percent: EXT_REVIEW_DISCOUNT_PERCENT,
    });
  }

  const rating = clampRating(body.rating);
  const use = cleanText(body.use, USE_MAX);
  const feedback = cleanText(body.feedback, FEEDBACK_MAX);
  const now = new Date().toISOString();

  // Mint the reward FIRST. Only stamp the survey complete once we actually have
  // a code, so a transient LS failure leaves the survey retryable rather than
  // stranding the user "completed" with no code. We still best-effort persist
  // their answers either way so the feedback is never lost.
  const minted = await mintFeedbackReward();

  const base: Record<string, unknown> = {
    email,
    survey_rating: rating,
    survey_use: use,
    survey_feedback: feedback,
    updated_at: now,
  };

  if (!minted) {
    // Save the answers, but do NOT mark complete: reloading the link lets them
    // resubmit to try minting again.
    await db.from("extension_review_nudges").upsert(base, { onConflict: "email" });
    return NextResponse.json(
      { ok: false, error: "We could not generate your code just now. Please try again in a moment." },
      { status: 503 },
    );
  }

  const { error } = await db.from("extension_review_nudges").upsert(
    {
      ...base,
      survey_completed_at: now,
      discount_code: minted.code,
      ls_discount_id: minted.discountId,
    },
    { onConflict: "email" },
  );
  if (error) {
    console.error("review feedback: save failed", error);
    return NextResponse.json({ ok: false, error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    code: minted.code,
    percent: EXT_REVIEW_DISCOUNT_PERCENT,
  });
}
