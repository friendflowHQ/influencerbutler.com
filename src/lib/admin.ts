import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type AdminSession = {
  userId: string;
  email: string;
};

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
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/**
 * Returns the current session's admin info if the caller's email is in the
 * ADMIN_EMAILS allowlist, or null otherwise. Use this at the top of every
 * admin-only route/page.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
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

  let userId: string | null = null;
  let email: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId = session?.user?.id ?? null;
    email = session?.user?.email ?? null;
  } catch (error) {
    console.error("getAdminSession: auth.getSession threw", error);
    return null;
  }

  if (!userId || !email) return null;

  const allow = parseAdminEmails();
  if (allow.size === 0) return null;
  if (!allow.has(email.toLowerCase())) return null;

  return { userId, email };
}

/**
 * Service-role Supabase client. Bypasses RLS — only call from admin-gated
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
