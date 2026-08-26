// Email step-up (2FA) for revealing an affiliate's full SSN/TIN.
//
// Mirrors finance-stepup.ts, scoped to the tax_stepup table. requireTaxReveal()
// layers a 6-digit emailed code (hashed, 5-attempt cap, VERIFY_WINDOW_HOURS
// window) on top of the normal affiliates.tax.view permission + super-admin
// gate on admin-tax-reveal. State lives server-side in tax_stepup (one row per
// staff user), so it is revocable and expires on its own; no cookie is used.
//
// Kept separate from finance-stepup on purpose: revealing a SSN and opening the
// P&L are independent step-up windows, and duplicating the (small, stable) logic
// avoids any risk to the live finance flow.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission, getAdminSession, type Actor } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-send";

const CODE_TTL_MINUTES = 10;
const RESEND_THROTTLE_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const VERIFY_WINDOW_HOURS = 12;

// hello@ is the app's established transactional sender; no-reply@ has no
// sending reputation and gets spam-filtered.
const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";

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
    .from("tax_stepup")
    .select("code_hash,code_expires_at,code_sent_at,attempts,verified_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMigrationPendingError(error)) return { row: null, migrationPending: true };
    console.error("tax-stepup: read failed", { code: (error as { code?: string }).code });
    return { row: null, migrationPending: false };
  }
  return { row: (data as StepupRow | null) ?? null, migrationPending: false };
}

export type SendCodeResult =
  | { ok: true }
  | { ok: false; reason: "throttled" | "send-failed" | "migration-pending" };

/** Generates a fresh 6-digit code, stores its hash, and emails it to the actor. */
export async function sendTaxRevealCode(actor: Actor): Promise<SendCodeResult> {
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
  const { error } = await db.from("tax_stepup").upsert(
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
    console.error("tax-stepup: upsert failed", { code: (error as { code?: string }).code });
    return { ok: false, reason: "send-failed" };
  }

  const text = [
    `Your tax-form reveal access code is: ${code}`,
    "",
    `It expires in ${CODE_TTL_MINUTES} minutes. Once verified, reveal access lasts ${VERIFY_WINDOW_HOURS} hours.`,
    "",
    "If you did not request this, someone with dashboard access tried to reveal an affiliate's taxpayer ID; you can ignore this email and reveal stays locked.",
  ].join("\n");

  const { ok } = await sendEmail({
    from: FROM_ADDRESS,
    to: actor.email,
    subject: `Tax reveal access code: ${code}`,
    text,
    category: "tax_stepup_code",
  });
  return ok ? { ok: true } : { ok: false, reason: "send-failed" };
}

export type VerifyCodeResult =
  | { ok: true; verifiedUntil: string }
  | {
      ok: false;
      reason: "no-code" | "expired" | "too-many-attempts" | "wrong-code" | "migration-pending";
    };

/** Checks a submitted code; on success opens the VERIFY_WINDOW_HOURS reveal window. */
export async function verifyTaxRevealCode(actor: Actor, code: string): Promise<VerifyCodeResult> {
  const db = createAdminClient();
  const { row, migrationPending } = await readRow(db, actor.userId);
  if (migrationPending) return { ok: false, reason: "migration-pending" };
  if (!row?.code_hash || !row.code_expires_at) return { ok: false, reason: "no-code" };

  if (new Date(row.code_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const attempts = typeof row.attempts === "number" ? row.attempts : 0;
  if (attempts >= MAX_ATTEMPTS) {
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
      .from("tax_stepup")
      .update({
        attempts: nextAttempts,
        ...(nextAttempts >= MAX_ATTEMPTS ? { code_hash: null, code_expires_at: null } : {}),
        updated_at: now.toISOString(),
      })
      .eq("user_id", actor.userId);
    return {
      ok: false,
      reason: nextAttempts >= MAX_ATTEMPTS ? "too-many-attempts" : "wrong-code",
    };
  }

  const verifiedUntil = new Date(now.getTime() + VERIFY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  await db
    .from("tax_stepup")
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

export type TaxRevealGate =
  | { ok: true; actor: Actor; verifiedUntil: string }
  | { ok: false; response: NextResponse };

/**
 * The gate for the TIN-reveal route: affiliates.tax.view permission + super-admin
 * session + an open step-up window. Returns a ready-to-return NextResponse on
 * failure:
 *
 *   const gate = await requireTaxReveal(request);
 *   if (!gate.ok) return gate.response;
 */
export async function requireTaxReveal(request: Request): Promise<TaxRevealGate> {
  const actor = await requirePermission("affiliates.tax.view", request);
  if (!actor) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  // Reveal is super-admin only, never delegated to an assistant.
  const superAdmin = await getAdminSession();
  if (!superAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const db = createAdminClient();
  const { row, migrationPending } = await readRow(db, actor.userId);
  if (migrationPending) {
    return { ok: false, response: NextResponse.json({ migrationPending: true }) };
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
