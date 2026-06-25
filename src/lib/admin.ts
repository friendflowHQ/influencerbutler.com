import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  ALL_PERMISSION_KEYS,
  isPermissionKey,
  type PermissionKey,
} from "./permissions";

export type AdminSession = {
  userId: string;
  email: string;
};

export type AdminSessionAny =
  | (AdminSession & { kind: "session" })
  | (AdminSession & { kind: "license" });

type ServiceClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
      order?: (col: string, options: { ascending: boolean }) => {
        limit?: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
      } & Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
  auth: {
    admin: {
      getUserById: (
        userId: string,
      ) => Promise<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
    };
  };
};

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      // Accept commas, semicolons, or any whitespace (incl. newlines) as
      // separators, so a value pasted one-email-per-line still parses.
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/**
 * Resolves the current Supabase session user from cookies, WITHOUT any
 * allowlist check. Returns null if there's no logged-in user. Used as the base
 * for both getAdminSession (super-admin gate) and resolveActor (staff lookup).
 */
export async function getSessionUser(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_CIxsGcwPAdC470Jw8QQGMw_Tvw41zM-",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // admin endpoints don't refresh cookies
        },
      },
    },
  ) as unknown as {
    auth: {
      getSession: () => Promise<{
        data: { session: { user?: { id?: string; email?: string | null } } | null };
      }>;
    };
  };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    const email = session?.user?.email ?? null;
    if (!userId || !email) return null;
    return { userId, email };
  } catch (error) {
    console.error("getSessionUser: auth.getSession threw", error);
    return null;
  }
}

export function isEmailAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = parseAdminEmails();
  if (allow.size === 0) return false;
  return allow.has(email.toLowerCase());
}

/**
 * Returns the current session's admin info if the caller's email is in the
 * ADMIN_EMAILS allowlist, or null otherwise. Use this for super-admin-only
 * surfaces (e.g. managing assistants). For permission-scoped surfaces use
 * requirePermission instead.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const su = await getSessionUser();
  if (!su) return null;
  if (!isEmailAdmin(su.email)) return null;
  return su;
}

/**
 * Resolves an admin identity via EITHER:
 *   1. Authorization: Bearer <license-key>  (Influencer Butler desktop)
 *      - The license is looked up against license_keys.key_hash, the
 *        owning email is resolved, and that email must be in
 *        ADMIN_EMAILS.
 *   2. Supabase session cookie               (website browser admin UI)
 *      - Falls back to getAdminSession() above.
 *
 * Returns the resolved admin or null. Use this in admin routes that need
 * to be callable from both surfaces.
 *
 * Lazy-imports license-auth to avoid a circular dependency (license-auth
 * imports from this file).
 */
export async function getAdminSessionAny(request: Request): Promise<AdminSessionAny | null> {
  const authHeader = request.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(authHeader)) {
    // License-bearer path.
    const { resolveLicenseOnly, isEmailAdmin } = await import("./license-auth");
    const result = await resolveLicenseOnly(request);
    if (!result.ok) return null;
    if (!isEmailAdmin(result.auth.email)) return null;
    return {
      kind: "license",
      userId: result.auth.userId,
      email: result.auth.email || "",
    };
  }
  // Session-cookie path.
  const session = await getAdminSession();
  if (!session) return null;
  return { kind: "session", userId: session.userId, email: session.email };
}

/**
 * Service-role Supabase client. Bypasses RLS - only call from admin-gated
 * routes after getAdminSession() returns non-null. Returns null if the
 * SUPABASE_SERVICE_ROLE_KEY env var is missing.
 */
export function createAdminClient(): ServiceClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    return null;
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op for service-role client
      },
    },
  }) as unknown as ServiceClient;
}

// ---------------------------------------------------------------------------
// Assistant accounts + granular permissions
// ---------------------------------------------------------------------------

export type ActorRole = "admin" | "assistant";

export type Actor = {
  userId: string;
  email: string;
  role: ActorRole;
  permissions: Set<PermissionKey>;
  kind: "session" | "license";
};

type StaffRow = {
  is_active?: boolean | null;
  permissions?: unknown;
};

/** Reads an active staff_members row for a user, or null. Service-role only. */
async function getActiveStaff(userId: string): Promise<StaffRow | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("staff_members")
      .select("is_active,permissions")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("getActiveStaff: query failed", error);
      return null;
    }
    return (data as StaffRow | null) ?? null;
  } catch (error) {
    console.error("getActiveStaff threw", error);
    return null;
  }
}

function toPermissionSet(raw: unknown): Set<PermissionKey> {
  const set = new Set<PermissionKey>();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (isPermissionKey(v)) set.add(v);
    }
  }
  return set;
}

/**
 * Resolves the acting admin/assistant for a request, via session cookie or
 * (when present) an Authorization: Bearer license key. Super-admins
 * (ADMIN_EMAILS) get every permission; assistants get the set on their active
 * staff_members row. Returns null for anyone who is neither.
 */
export async function resolveActor(request?: Request): Promise<Actor | null> {
  let userId: string | null = null;
  let email: string | null = null;
  let kind: "session" | "license" = "session";

  const authHeader = request?.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(authHeader)) {
    const { resolveLicenseOnly } = await import("./license-auth");
    const result = await resolveLicenseOnly(request as Request);
    if (result.ok) {
      userId = result.auth.userId;
      email = result.auth.email ?? null;
      kind = "license";
    }
  }

  if (!userId) {
    const su = await getSessionUser();
    if (su) {
      userId = su.userId;
      email = su.email;
      kind = "session";
    }
  }

  if (!userId || !email) return null;

  if (isEmailAdmin(email)) {
    return {
      userId,
      email,
      role: "admin",
      permissions: new Set(ALL_PERMISSION_KEYS),
      kind,
    };
  }

  const staff = await getActiveStaff(userId);
  if (staff && staff.is_active !== false) {
    return {
      userId,
      email,
      role: "assistant",
      permissions: toPermissionSet(staff.permissions),
      kind,
    };
  }

  return null;
}

/**
 * Returns the acting admin/assistant if they hold `perm` (super-admins always
 * do), or null. Use at the top of every permission-scoped admin route:
 *
 *   const actor = await requirePermission("affiliates.approve", request);
 *   if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */
export async function requirePermission(
  perm: PermissionKey,
  request?: Request,
): Promise<Actor | null> {
  const actor = await resolveActor(request);
  if (!actor) return null;
  if (actor.role === "admin") return actor;
  return actor.permissions.has(perm) ? actor : null;
}
