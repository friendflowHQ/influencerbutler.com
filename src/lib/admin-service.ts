import { createAdminClient } from "./admin";

/**
 * A broadly-typed view of the service-role Supabase client for the admin
 * override endpoints. createAdminClient() returns a deliberately narrow type;
 * this casts it to the wider surface (chained query builder + auth admin) the
 * override routes need, without each route redefining 40 lines of types.
 *
 * Only call after an admin/permission gate (requirePermission). Service-role
 * bypasses RLS.
 */

type Row = Record<string, unknown>;
type Result<T> = Promise<{ data: T | null; error: unknown }>;

export type AdminQuery = Result<Row[]> & {
  eq: (col: string, value: string) => AdminQuery;
  ilike: (col: string, value: string) => AdminQuery;
  in: (col: string, values: string[]) => AdminQuery;
  order: (col: string, opts: { ascending: boolean }) => AdminQuery;
  limit: (n: number) => AdminQuery;
  maybeSingle: () => Result<Row>;
};

export type AdminTable = {
  select: (cols: string) => AdminQuery;
  insert: (payload: Row | Row[]) => Result<Row[]>;
  update: (payload: Row) => { eq: (col: string, value: string) => Result<Row[]> };
  delete: () => { eq: (col: string, value: string) => Result<Row[]> };
  upsert: (payload: Row, opts?: { onConflict: string }) => Result<Row[]>;
};

export type AdminService = {
  from: (table: string) => AdminTable;
  auth: {
    admin: {
      createUser: (attrs: {
        email: string;
        email_confirm?: boolean;
        user_metadata?: Row;
      }) => Promise<{ data: { user: { id: string } | null }; error: { message?: string } | null }>;
      deleteUser: (
        id: string,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: { id: string; email?: string | null }[] } | null;
        error: { message?: string } | null;
      }>;
      generateLink: (attrs: {
        type: "magiclink" | "invite" | "recovery";
        email: string;
        options?: { redirectTo?: string };
      }) => Promise<{
        data: { properties?: { action_link?: string } | null } | null;
        error: { message?: string } | null;
      }>;
      getUserById: (id: string) => Promise<{
        data: { user: { id: string; email?: string | null } | null };
        error: unknown;
      }>;
    };
  };
};

export function adminService(): AdminService | null {
  return createAdminClient() as unknown as AdminService | null;
}
