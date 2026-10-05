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

type LicenseKeyRow = { id: string; key: string; status: string | null; created_at: string | null };

export type FoyerKeyOption = {
  id: string;
  /** Masked to the last 4 characters. The full key never reaches the browser. */
  label: string;
  status: string;
  activeSubscribers: number | null;
  createdAt: string | null;
};

/** Query parameter the dashboard uses to say which of the creator's keys to read. */
export const FOYER_KEY_PARAM = "keyId";

/**
 * The account's usable license keys, newest first, active ones before inactive,
 * de-duplicated by key string. Foyer data is stored per key (the Worker hashes
 * the key into the owner id), so an account with several keys has several
 * separate subscriber lists.
 */
async function listMyLicenseKeyRows(userId: string): Promise<LicenseKeyRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("license_keys")
    .select("id,key,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const seen = new Set<string>();
  const rows: LicenseKeyRow[] = [];
  for (const r of (data ?? []) as Partial<LicenseKeyRow>[]) {
    if (!r.id || !r.key || seen.has(r.key)) continue;
    seen.add(r.key);
    rows.push({ id: r.id, key: r.key, status: r.status ?? null, created_at: r.created_at ?? null });
  }
  return [...rows.filter((r) => r.status === "active"), ...rows.filter((r) => r.status !== "active")];
}

async function countActiveSubscribers(licenseKey: string): Promise<number | null> {
  const res = await callLinksWorkerAsUser<{ count?: number }>("/api/foyer/newsletter/subscribers", licenseKey);
  return res.ok ? Number(res.data.count) || 0 : null;
}

/**
 * Works out which of the user's keys to read. An explicit `requestedId` (a
 * license_keys.id the user picked) wins when it belongs to them. Otherwise, with
 * more than one key, the one that actually holds the most subscribers wins, so
 * the website lands on the same list the desktop app shows instead of an empty
 * one. Ties and failures fall back to the newest active key.
 */
export async function resolveMyFoyerKey(
  userId: string,
  requestedId?: string | null,
): Promise<{ chosen: LicenseKeyRow | null; keys: FoyerKeyOption[] }> {
  const rows = await listMyLicenseKeyRows(userId);
  if (rows.length === 0) return { chosen: null, keys: [] };

  const counts = new Map<string, number | null>();
  if (rows.length > 1) {
    await Promise.all(rows.map(async (r) => counts.set(r.id, await countActiveSubscribers(r.key))));
  }

  let chosen = requestedId ? rows.find((r) => r.id === requestedId) ?? null : null;
  if (!chosen) {
    chosen = rows[0];
    for (const r of rows) {
      if ((counts.get(r.id) ?? 0) > (counts.get(chosen.id) ?? 0)) chosen = r;
    }
  }

  const keys = rows.map((r) => ({
    id: r.id,
    label: `Key ending ${r.key.slice(-4)}`,
    status: r.status ?? "unknown",
    activeSubscribers: counts.get(r.id) ?? null,
    createdAt: r.created_at,
  }));
  return { chosen, keys };
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
export async function requireMyLicenseKey(
  request?: Request,
): Promise<{ licenseKey: string; keyId: string; keys: FoyerKeyOption[] } | { response: NextResponse }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const requestedId = request ? new URL(request.url).searchParams.get(FOYER_KEY_PARAM) : null;
  const { chosen, keys } = await resolveMyFoyerKey(data.user.id, requestedId);
  if (!chosen) {
    return { response: NextResponse.json({ ok: false, error: "no_license" }, { status: 404 }) };
  }
  return { licenseKey: chosen.key, keyId: chosen.id, keys };
}

/** The request's query string minus the dashboard-only key picker, ready to forward to the Worker. */
export function forwardQuery(request: Request): string {
  const params = new URL(request.url).searchParams;
  params.delete(FOYER_KEY_PARAM);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
