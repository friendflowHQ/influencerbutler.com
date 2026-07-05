/**
 * extension-api.ts - shared plumbing for the /api/extension/* routes that the
 * free Chrome extension calls with an Authorization: Bearer <license-key>
 * header (and the dashboard calls with its session cookie).
 *
 * CORS: requests arrive from a chrome-extension:// origin. Allow-Origin '*'
 * is safe here because auth is a Bearer header, never cookies (same pattern
 * as /api/mcp).
 *
 * DB: the extension_* tables are RLS-enabled with zero policies (see
 * supabase/migrations/20260706_extension_data.sql), so every read/write must
 * go through the service-role client after auth. If the migration has not
 * been applied yet (prod schema is applied manually), Postgres raises 42P01
 * and routes respond with { migrationPending: true } instead of a hard 500.
 */
import { NextResponse } from "next/server";

export const EXT_MAX_BATCH = 50;
export const ASIN_RE = /^[A-Z0-9]{10}$/;
export const MARKETPLACE_RE = /^[a-z0-9.-]{2,40}$/;
export const EXT_TITLE_MAX = 300;
export const EXT_DETAIL_MAX = 500;

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function jsonWithCors(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

export function optionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * The migration is not applied yet. supabase-js goes through PostgREST, which
 * reports a missing table as PGRST205 ("not found in the schema cache"), not
 * the raw Postgres 42P01 - so both must be treated as "migration pending".
 */
export function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export function migrationPendingResponse(): NextResponse {
  return jsonWithCors({ migrationPending: true, error: "Migration not applied yet" }, 200);
}

export function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.round(value);
  return Math.min(max, Math.max(min, int));
}

export function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
