/**
 * Shared helpers for the admin "credit an affiliate" tools (issue a comp on an
 * affiliate's behalf, or retroactively attribute an order to them). Kept out of
 * the routes so both share one affiliate-resolution contract.
 *
 * The admin client (createAdminClient) is deliberately typed narrowly, so - as
 * elsewhere in this codebase (see admin-owed / affiliate-lookup) - we cast it to
 * a local chainable-query shape that matches PostgREST's thenable builder.
 */

type Rows = Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
type Single = Promise<{ data: Record<string, unknown> | null; error: unknown }>;

export type FilterBuilder = Rows & {
  eq: (col: string, value: string) => FilterBuilder;
  ilike: (col: string, value: string) => FilterBuilder;
  limit: (n: number) => Rows;
  maybeSingle: () => Single;
};

export type QueryClient = {
  from: (table: string) => {
    select: (cols: string) => FilterBuilder;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

/** Cast the narrowly-typed admin client to the richer chainable shape we use. */
export function asQueryClient(admin: unknown): QueryClient {
  return admin as unknown as QueryClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape PostgREST ilike wildcards so a value is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type ResolvedAffiliate = {
  userId: string;
  code: string | null;
  displayName: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Resolve a target affiliate from either their branded code (case-insensitive)
 * or their user id. Returns null when there is no matching profile or the
 * profile is not flagged as an affiliate. displayName prefers the profile's
 * display_name and falls back to the application full_name.
 */
export async function resolveAdminAffiliate(
  admin: unknown,
  input: string,
): Promise<ResolvedAffiliate | null> {
  const value = input.trim();
  if (!value) return null;
  const q = asQueryClient(admin);
  const byId = UUID_RE.test(value);

  const base = q.from("profiles").select("id,affiliate_code,display_name,is_affiliate");
  const { data, error } = byId
    ? await base.eq("id", value).limit(1)
    : await base.ilike("affiliate_code", escapeLike(value)).limit(1);
  if (error) {
    console.error("resolveAdminAffiliate: lookup failed", error);
    return null;
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row || row.is_affiliate !== true) return null;

  let displayName = str(row.display_name);
  if (!displayName) {
    const app = await q
      .from("affiliate_applications")
      .select("full_name")
      .eq("user_id", row.id as string)
      .maybeSingle();
    displayName = str(app.data?.full_name);
  }

  return { userId: row.id as string, code: str(row.affiliate_code), displayName };
}
