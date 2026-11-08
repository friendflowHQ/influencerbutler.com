/**
 * Server-only client for the links Worker's owner-only /api/admin/* routes
 * (workers/links in the InfluencerButler repo), used by the admin Finance >
 * Foyer commission tab and the Growth page. Authenticates with the shared
 * LINKS_ADMIN_TOKEN (same value as the Worker secret of that name) sent as
 * x-ib-admin-token. Never import this from a client component: the token
 * must stay on the server.
 */

import { createHmac } from "node:crypto";

const DEFAULT_WORKER_URL = "https://links.influencerbutler.com";

export type LinksAdminResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

function baseUrl(): string {
  return (process.env.LINKS_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

export function linksAdminConfigured(): boolean {
  return !!process.env.LINKS_ADMIN_TOKEN;
}

/**
 * Call an admin route on the links Worker. `path` starts after /api
 * (e.g. "/admin/commerce/summary"). `query` values that are empty are dropped.
 */
export async function callLinksAdmin<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST"; query?: Record<string, string | number | null | undefined>; body?: unknown } = {},
): Promise<LinksAdminResult<T>> {
  const token = process.env.LINKS_ADMIN_TOKEN;
  if (!token) return { ok: false, status: 503, error: "LINKS_ADMIN_TOKEN is not set on the website." };
  const url = new URL(`${baseUrl()}/api${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && String(v) !== "") url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "x-ib-admin-token": token,
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, error: "Could not reach the links service." };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const errorText = (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
    ? (data as { error: string }).error
    : null);
  if (!res.ok) return { ok: false, status: res.status, error: errorText ?? `Links service error (${res.status})`, data };
  return { ok: true, status: res.status, data: data as T };
}

/**
 * A 15-minute link to a product's cover or file on the links Worker
 * (GET /api/admin-asset/:productId), signed with LINKS_ADMIN_TOKEN so the
 * admin's browser can open it without the token header. The message format
 * must match adminAssetMessage() in workers/links/src/routes/admin-commerce.js.
 */
export function signedAdminAssetUrl(productId: string, kind: "cover" | "file", fileId?: string): string | null {
  const token = process.env.LINKS_ADMIN_TOKEN;
  if (!token) return null;
  const exp = Date.now() + 15 * 60 * 1000;
  const file = kind === "file" ? fileId ?? "" : "";
  const sig = createHmac("sha256", token).update(`asset|${productId}|${kind}|${file}|${exp}`).digest("hex");
  const url = new URL(`${baseUrl()}/api/admin-asset/${encodeURIComponent(productId)}`);
  url.searchParams.set("kind", kind);
  if (kind === "file") url.searchParams.set("file", file);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

/** Pass through the Finance tab's range / filter params, whitelisted. */
export function pickQuery(request: Request, keys: string[]): Record<string, string> {
  const src = new URL(request.url).searchParams;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = src.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}
