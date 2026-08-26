// Email step-up (2FA) for the admin Finance section.
//
// Every /api/admin/finance/* route calls requireFinance(), which layers an
// email-code verification on top of the normal permission gate: the caller
// must hold the finance permission AND have entered a 6-digit code (emailed to
// their own address) within the last VERIFY_WINDOW_HOURS. State lives
// server-side in the finance_stepup table (one row per staff user), so it is
// revocable and survives nothing longer than its expiry; no cookie is used.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission, type Actor } from "@/lib/admin";
import type { PermissionKey } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-send";

const CODE_TTL_MINUTES = 10;
const RESEND_THROTTLE_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const VERIFY_WINDOW_HOURS = 12;

const FROM_ADDRESS = "Influencer Butler <no-reply@influencerbutler.com>";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** True for Postgres "relation/column does not exist" errors (prod migration lag). */
export function isMigrationPendingError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

type StepupRow = {
  code_hash: string | null;
  code_expires_at: string | null;
  code_sent_at: string | null;
  attempts: number | null;
  verified_until: string | null;
};

async function readRow(
  db: SupabaseClient,
  userId: string,
): Promise<{ row: StepupRow | null; migrationPending: boolean }> {
  const { data, error } = await db
    .from("finance_stepup")
    .select("code_hash,code_expires_at,code_sent_at,attempts,verified_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMigrationPendingError(error)) return { row: null, migrationPending: true };
    console.error("finance-stepup: read failed", error);
    return { row: null, migrationPending: false };
  }
  return { row: (data as StepupRow | null) ?? null, migrationPending: false };
}

export type SendCodeResult =
  | { ok: true }
  | { ok: false; reason: "throttled" | "send-failed" | "migration-pending" };

/**
 * Generates a fresh 6-digit code, stores its hash, and emails it to the
 * actor's own address. Throttled to one send per RESEND_THROTTLE_SECONDS.
 */
export async function sendFinanceStepUpCode(actor: Actor): Promise<SendCodeResult> {
  const db = createAdminClient();
  const { row, migrationPending } = await readRow(db, actor.userId);
  if (migrationPending) return { ok: false, reason: "migration-pending" };

  if (row?.code_sent_at) {
    const sentMs = new Date(row.code_sent_at).getTime();
    if (Number.isFinite(sentMs) && Date.now() - sentMs < RESEND_THROTTLE_SECONDS * 1000) {
      return { ok: false, reason: "throttled" };
    }
  }

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const now = new Date();
  const { error } = await db.from("finance_stepup").upsert(
    {
      user_id: actor.userId,
      code_hash: sha256Hex(code),
      code_expires_at: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
      code_sent_at: now.toISOString(),
      attempts: 0,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    if (isMigrationPendingError(error)) return { ok: false, reason: "migration-pending" };
    console.error("finance-stepup: upsert failed", error);
    return { ok: false, reason: "send-failed" };
  }

  const text = [
    `Your Finance dashboard access code is: ${code}`,
    "",
    `It expires in ${CODE_TTL_MINUTES} minutes. Once verified, access lasts ${VERIFY_WINDOW_HOURS} hours.`,
    "",
    "If you did not request this, someone with dashboard access tried to open the Finance section; you can ignore this email and access stays locked.",
  ].join("\n");

  const { ok } = await sendEmail({
    from: FROM_ADDRESS,
    to: actor.email,
    subject: `Finance access code: ${code}`,
    text,
    category: "finance_stepup_code",
  });
  return ok ? { ok: true } : { ok: false, reason: "send-failed" };
}

export type VerifyCodeResult =
  | { ok: true; verifiedUntil: string }
  | {
      ok: false;
      reason: "no-code" | "expired" | "too-many-attempts" | "wrong-code" | "migration-pending";
    };

/** Checks a submitted code; on success opens the VERIFY_WINDOW_HOURS window. */
export async function verifyFinanceStepUpCode(
  actor: Actor,
  code: string,
): Promise<VerifyCodeResult> {
  const db = createAdminClient();
  const { row, migrationPending } = await readRow(db, actor.userId);
  if (migrationPending) return { ok: false, reason: "migration-pending" };
  if (!row?.code_hash || !row.code_expires_at) return { ok: false, reason: "no-code" };

  if (new Date(row.code_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const attempts = typeof row.attempts === "number" ? row.attempts : 0;
  if (attempts >= MAX_ATTEMPTS) {
    // Belt and braces: the hash is cleared when the limit is hit below, but a
    // racing request could still land here.
    return { ok: false, reason: "too-many-attempts" };
  }

  const submitted = sha256Hex(code.trim());
  const expected = row.code_hash;
  const matches =
    submitted.length === expected.length &&
    timingSafeEqual(Buffer.from(submitted, "utf8"), Buffer.from(expected, "utf8"));

  const now = new Date();
  if (!matches) {
    const nextAttempts = attempts + 1;
    await db
      .from("finance_stepup")
      .update({
        attempts: nextAttempts,
        // Invalidate the code entirely once the attempt budget is spent.
        ...(nextAttempts >= MAX_ATTEMPTS ? { code_hash: null, code_expires_at: null } : {}),
        updated_at: now.toISOString(),
      })
      .eq("user_id", actor.userId);
    return {
      ok: false,
      reason: nextAttempts >= MAX_ATTEMPTS ? "too-many-attempts" : "wrong-code",
    };
  }

  const verifiedUntil = new Date(
    now.getTime() + VERIFY_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  await db
    .from("finance_stepup")
    .update({
      code_hash: null,
      code_expires_at: null,
      attempts: 0,
      verified_until: verifiedUntil,
      updated_at: now.toISOString(),
    })
    .eq("user_id", actor.userId);
  return { ok: true, verifiedUntil };
}

export type FinanceGate =
  | { ok: true; actor: Actor; verifiedUntil: string }
  | { ok: false; response: NextResponse };

/**
 * The single gate for every finance route: permission check first, then the
 * step-up window. Returns a ready-to-return NextResponse on failure so call
 * sites stay one-liners:
 *
 *   const gate = await requireFinance("finance.view", request);
 *   if (!gate.ok) return gate.response;
 */
export async function requireFinance(
  perm: PermissionKey,
  request: Request,
): Promise<FinanceGate> {
  const actor = await requirePermission(perm, request);
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const db = createAdminClient();
  const { row, migrationPending } = await readRow(db, actor.userId);
  if (migrationPending) {
    return {
      ok: false,
      response: NextResponse.json({ migrationPending: true }),
    };
  }

  const verifiedUntil = row?.verified_until ?? null;
  if (!verifiedUntil || new Date(verifiedUntil).getTime() < Date.now()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Step-up required", stepUpRequired: true },
        { status: 403 },
      ),
    };
  }

  return { ok: true, actor, verifiedUntil };
}
