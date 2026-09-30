/**
 * Server-side proxy to the links Worker's license-authed /api/foyer/newsletter/*
 * routes (workers/links in the InfluencerButler repo). The dashboard's Foyer
 * Subscribers page has no license key in the browser (unlike the desktop app,
 * which signs in with one directly), so every call here resolves the signed-in
 * Supabase user's OWN license key server-side (resolveMyLicenseKey) and builds
 * the Authorization header itself before forwarding to the Worker. Mirrors the
 * "client -> /api/me -> upstream" shape of src/lib/support-worker.ts, but with a
 * server-resolved key instead of a forwarded one (the desktop already holds its
 * key directly, so it calls the Worker without this layer at all).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_WORKER_URL = "https://links.influencerbutler.com";

export type LinksWorkerResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

function workerBaseUrl(): string {
  return (process.env.LINKS_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

type LicenseKeyRow = { key?: string | null; status?: string | null };

/**
 * Resolves the signed-in user's own license key, preferring an active one and
 * falling back to their most recently created key otherwise. Unlike the fuller
 * resolution chain in /api/me/subscription-details (which also falls back to a
 * live Lemon Squeezy lookup for a brand-new account), this only reads the local
 * license_keys table: a user who has never activated the desktop app has no
 * Foyer data to show yet regardless, so the extra LS round trip buys nothing
 * here.
 */
export async function resolveMyLicenseKey(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("license_keys")
    .select("key,status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as LicenseKeyRow[];
  const best = rows.find((r) => r.status === "active" && r.key) ?? rows.find((r) => r.key) ?? null;
  return best?.key ?? null;
}

/**
 * Call a license-authed /api/foyer/newsletter/* path on the links Worker, using
 * the given license key as the Bearer token. The Worker derives `owner` from
 * that key itself, so every response is already scoped to the right creator.
 */
export async function callLinksWorkerAsUser<T = unknown>(
  path: string,
  licenseKey: string,
  init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<LinksWorkerResult<T>> {
  const method = init?.method || "GET";
  const url = `${workerBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = { authorization: `Bearer ${licenseKey}` };
  if (init?.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    console.error("callLinksWorkerAsUser fetch failed", err);
    return { ok: false, status: 502, error: "Links worker unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && typeof payload === "object" && (payload as { ok?: boolean }).ok === false)) {
    const error =
      (payload && typeof payload === "object" && (payload as { error?: string }).error) ||
      `Worker HTTP ${res.status}`;
    return { ok: false, status: res.ok ? 502 : res.status, error: String(error) };
  }

  return { ok: true, status: res.status, data: (payload ?? {}) as T };
}

/**
 * Session check + license-key resolution in one call, shared by every Foyer
 * Subscribers API route. Returns either the resolved key or a NextResponse the
 * route can return immediately (401 signed out, 404 no license on the account
 * yet -- e.g. never activated the desktop app).
 */
export async function requireMyLicenseKey(): Promise<{ licenseKey: string } | { response: NextResponse }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const licenseKey = await resolveMyLicenseKey(data.user.id);
  if (!licenseKey) {
    return { response: NextResponse.json({ ok: false, error: "no_license" }, { status: 404 }) };
  }
  return { licenseKey };
}
