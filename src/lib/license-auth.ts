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
import { createAdminClient } from "@/lib/admin";

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
          data: { user_id?: string | null; key_hash?: string | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
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
  const admin = createAdminClient() as unknown as AdminLookupClient | null;
  if (!admin) {
    return { ok: false, status: 503, error: "Server misconfigured" };
  }
  const licenseHash = hashLicenseKey(key);
  const { data: row, error } = await admin
    .from("license_keys")
    .select("user_id, key_hash")
    .eq("key_hash", licenseHash)
    .maybeSingle();
  if (error) {
    console.error("license-auth: license_keys lookup failed", error);
    return { ok: false, status: 500, error: "License lookup failed" };
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
