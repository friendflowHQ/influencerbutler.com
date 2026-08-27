/**
 * license-auth.ts - dual-auth helper for Q&A routes that need to accept
 * BOTH the Supabase session cookie (website browser users) AND an
 * Authorization: Bearer <license-key> header (Influencer Butler desktop
 * app users).
 *
 * The desktop app does not hold a Supabase session - it authenticates by
 * sending the user's real Lemon Squeezy license key, which we hash
 * server-side and look up against license_keys.key_hash to resolve the
 * owning user. This is the same key_hash lookup that
 * /api/profiles/by-license uses (introduced in migration
 * 20260520_license_key_hash.sql), reused here so both paths share one
 * implementation.
 *
 * Returned shape is a discriminated union by `kind` so callers can
 * branch on whether they need session-cookie-aware behavior (e.g.
 * cookie refresh) or just need a user_id + email.
 *
 * NOTE: do NOT reuse FEEDBACK_LOOKUP_SECRET for this. That secret
 * guards the worker -> site channel (server-to-server). The app -> site
 * channel authenticates with the user's own license key.
 */
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateLicenseWithLs } from "@/lib/lemonsqueezy";

export type ResolvedSessionAuth = {
  kind: "session";
  userId: string;
  email: string | null;
};

export type ResolvedLicenseAuth = {
  kind: "license";
  userId: string;
  email: string | null;
  licenseHash: string;
};

export type ResolvedAuth = ResolvedSessionAuth | ResolvedLicenseAuth;

export type AuthFailure = {
  ok: false;
  status: number;
  error: string;
};

export type AuthResult = { ok: true; auth: ResolvedAuth } | AuthFailure;

const BEARER_RE = /^Bearer\s+(.+)$/i;
const LICENSE_KEY_MIN = 8;
const LICENSE_KEY_MAX = 200;

type SessionClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
};

type AdminLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data:
            | { id?: string | null; user_id?: string | null; key_hash?: string | null }
            | null;
          error: { message?: string } | null;
        }>;
        limit: (count: number) => Promise<{
          data:
            | { id?: string | null; user_id?: string | null; key_hash?: string | null }[]
            | null;
          error: { message?: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{
        error: { message?: string } | null;
      }>;
    };
    upsert: (
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => Promise<{ error: { message?: string } | null }>;
  };
  auth: {
    admin: {
      getUserById: (userId: string) => Promise<{
        data: { user: { id: string; email?: string | null } | null };
        error: unknown;
      }>;
    };
  };
};

// A Lemon Squeezy / in-house comp key is always a UUID (comp keys are minted
// as randomUUID().toUpperCase()). Gating the LS backfill on this shape means an
// attacker spraying arbitrary strings at a bearer route never reaches the LS
// API; only UUID-shaped guesses do, and those still have to hit a real key in
// an unguessable keyspace.
const LS_KEY_FORMAT_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Per-instance negative cache so a repeated bad (but UUID-shaped) key does not
// hit the LS API on every request. Keyed by license hash -> expiry epoch ms.
// This is abuse dampening, not security; security is the format gate plus the
// keyspace. Best-effort and bounded.
const LS_BACKFILL_NEGATIVE_TTL_MS = 10 * 60 * 1000;
const LS_BACKFILL_NEGATIVE_MAX = 500;
const lsBackfillNegativeCache = new Map<string, number>();

function negativeCacheHas(hash: string): boolean {
  const expiry = lsBackfillNegativeCache.get(hash);
  if (expiry == null) return false;
  if (expiry <= Date.now()) {
    lsBackfillNegativeCache.delete(hash);
    return false;
  }
  return true;
}

function negativeCacheAdd(hash: string): void {
  if (lsBackfillNegativeCache.size >= LS_BACKFILL_NEGATIVE_MAX) {
    const oldest = lsBackfillNegativeCache.keys().next().value;
    if (oldest !== undefined) lsBackfillNegativeCache.delete(oldest);
  }
  lsBackfillNegativeCache.set(hash, Date.now() + LS_BACKFILL_NEGATIVE_TTL_MS);
}

/**
 * Last-resort self-heal for a bearer key with no local license_keys row: the LS
 * license_key_created webhook drops silently (it returns 200, so LS never
 * retries), leaving a paying customer's key unknown to us. Mirrors the read-time
 * backfill in /api/me/subscription-details, but works from the bare key alone
 * (no session, no email) via the public LS validate endpoint. Returns the owning
 * user_id on success, or null (leaving the caller to fail as before).
 *
 * Deliberately does NOT create a stub user: this runs on unauthenticated bearer
 * routes, unlike the signature-verified webhook. If LS knows the key but no
 * local profile matches the customer email, we log and give up.
 */
async function backfillLicenseRowFromLs(
  admin: AdminLookupClient,
  key: string,
  licenseHash: string,
): Promise<string | null> {
  if (!LS_KEY_FORMAT_RE.test(key)) return null;
  if (negativeCacheHas(licenseHash)) return null;

  const lsLicense = await validateLicenseWithLs(key);
  if (!lsLicense) {
    negativeCacheAdd(licenseHash);
    return null;
  }

  const email = lsLicense.customerEmail?.trim().toLowerCase() || null;
  if (!email) {
    negativeCacheAdd(licenseHash);
    return null;
  }

  const profile = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  const userId = profile.data?.id ? String(profile.data.id) : null;
  if (!userId) {
    // LS knows the key but we have no account for the buyer (e.g. a guest
    // checkout where every webhook dropped). Nothing safe to attach it to.
    console.warn("license-auth: LS backfill found no local profile for buyer");
    negativeCacheAdd(licenseHash);
    return null;
  }

  const upsert = await admin.from("license_keys").upsert(
    {
      ls_license_key_id: lsLicense.lsLicenseKeyId,
      user_id: userId,
      subscription_id: null,
      key: lsLicense.key,
      key_hash: hashLicenseKey(lsLicense.key),
      status: lsLicense.status,
      activation_limit: lsLicense.activationLimit,
    },
    { onConflict: "ls_license_key_id" },
  );
  if (upsert.error) {
    console.error("license-auth: LS backfill upsert failed", upsert.error);
    return null;
  }
  console.info("license-auth: self-healed missing license_keys row from LS");
  return userId;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashLicenseKey(key: string): string {
  return sha256Hex(key.trim());
}

async function resolveLicenseBearer(
  rawKey: string,
): Promise<ResolvedLicenseAuth | AuthFailure> {
  const key = rawKey.trim();
  if (key.length < LICENSE_KEY_MIN || key.length > LICENSE_KEY_MAX) {
    return { ok: false, status: 401, error: "Invalid license key" };
  }
  let admin: AdminLookupClient;
  try {
    admin = createAdminClient() as unknown as AdminLookupClient;
  } catch (err) {
    console.error("license-auth: service-role client unavailable", err);
    return { ok: false, status: 503, error: "Server misconfigured" };
  }
  const licenseHash = hashLicenseKey(key);
  // .limit(1) (not .maybeSingle()) on purpose: duplicate license_keys rows can
  // share one key_hash (the LS self-heal upsert keys on ls_license_key_id, not
  // key_hash, so a re-issued/re-subscribed key can leave two rows). maybeSingle
  // ERRORS on 2+ rows, which used to 500 the whole assistant for that user with
  // "License lookup failed". Any matching row resolves the same owning user, so
  // taking the first is correct and can never error on duplicates.
  const hashLookup = await admin
    .from("license_keys")
    .select("user_id, key_hash")
    .eq("key_hash", licenseHash)
    .limit(1);
  if (hashLookup.error) {
    console.error("license-auth: license_keys lookup failed", hashLookup.error);
    return { ok: false, status: 500, error: "License lookup failed" };
  }
  let row = hashLookup.data?.[0] ?? null;
  // Self-heal fallback: a valid row may exist with a null or stale key_hash
  // (e.g. written before the key_hash backfill, or by a path that did not
  // compute it). Match on the plaintext key, then backfill the hash so the
  // next activation hits the fast indexed key_hash path above.
  if (!row || !row.user_id) {
    const keyLookup = await admin
      .from("license_keys")
      .select("user_id, key_hash")
      .eq("key", key)
      .limit(1);
    if (keyLookup.error) {
      console.error(
        "license-auth: license_keys key fallback failed",
        keyLookup.error,
      );
      return { ok: false, status: 500, error: "License lookup failed" };
    }
    const keyRow = keyLookup.data?.[0] ?? null;
    if (keyRow && keyRow.user_id) {
      row = keyRow;
      if (keyRow.key_hash !== licenseHash) {
        const upd = await admin
          .from("license_keys")
          .update({ key_hash: licenseHash })
          .eq("key", key);
        if (upd.error) {
          // Non-fatal: the caller is still authenticated this request; the
          // hash just was not repaired, so it will retry the fallback again.
          console.warn("license-auth: key_hash backfill failed", upd.error);
        }
      }
    }
  }
  // Still no row: the license_key_created webhook may have dropped. Try a
  // one-shot self-heal from the LS API (UUID-shaped keys only, negative-cached).
  if (!row || !row.user_id) {
    const healedUserId = await backfillLicenseRowFromLs(admin, key, licenseHash);
    if (healedUserId) {
      row = { user_id: healedUserId, key_hash: licenseHash };
    }
  }
  if (!row || !row.user_id) {
    return { ok: false, status: 401, error: "Unknown license" };
  }
  // Get the email separately via auth.admin.getUserById.
  let email: string | null = null;
  try {
    const { data: userRes } = await admin.auth.admin.getUserById(row.user_id);
    email = userRes?.user?.email ?? null;
  } catch (err) {
    // Email is best-effort - the user exists, we just couldn't read their email.
    console.warn("license-auth: getUserById warning", err);
  }
  return {
    kind: "license",
    userId: row.user_id,
    email,
    licenseHash,
  };
}

async function resolveSessionCookie(): Promise<ResolvedSessionAuth | null> {
  try {
    const supabase = (await createClient()) as unknown as SessionClient;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;
    return {
      kind: "session",
      userId: data.user.id,
      email: data.user.email ?? null,
    };
  } catch (err) {
    console.warn("license-auth: session lookup threw", err);
    return null;
  }
}

/**
 * Resolves the caller's identity using EITHER:
 *   1. Authorization: Bearer <license-key>  (Influencer Butler desktop)
 *   2. Supabase session cookie               (website browser)
 *
 * License-bearer takes priority when present - this lets the desktop app
 * always identify itself even if it happens to be running on a machine
 * where a different Supabase session cookie was set by an unrelated
 * site visit.
 *
 * Returns { ok: true, auth } on success or { ok: false, status, error }
 * on failure. Callers should branch on auth.kind only when they need
 * cookie-write semantics or want to record the license hash; otherwise
 * just use auth.userId and auth.email.
 */
export async function resolveAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(BEARER_RE);
  if (bearerMatch && bearerMatch[1]) {
    const license = await resolveLicenseBearer(bearerMatch[1]);
    if ("ok" in license && license.ok === false) return license;
    return { ok: true, auth: license as ResolvedLicenseAuth };
  }
  const session = await resolveSessionCookie();
  if (!session) {
    return { ok: false, status: 401, error: "Sign in required" };
  }
  return { ok: true, auth: session };
}

/**
 * Resolves a license-bearer ONLY (no session fallback). Used by the
 * desktop-app-targeted /api/admin/check-by-license route.
 */
export async function resolveLicenseOnly(request: Request): Promise<
  { ok: true; auth: ResolvedLicenseAuth } | AuthFailure
> {
  const authHeader = request.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(BEARER_RE);
  if (!bearerMatch || !bearerMatch[1]) {
    return { ok: false, status: 401, error: "License required" };
  }
  const license = await resolveLicenseBearer(bearerMatch[1]);
  if ("ok" in license && license.ok === false) return license;
  return { ok: true, auth: license as ResolvedLicenseAuth };
}

/**
 * Helper: given a resolved email, decide whether the caller is an admin
 * per the ADMIN_EMAILS env-var allowlist. Mirrors src/lib/admin.ts logic
 * but takes the email as input so it works for license-bearer paths
 * where there is no session cookie.
 */
export function isEmailAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "";
  const allow = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
  if (allow.size === 0) return false;
  return allow.has(email.toLowerCase());
}
