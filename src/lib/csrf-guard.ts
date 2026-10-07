/**
 * CSRF guard for cookie-authenticated, state-changing API routes.
 *
 * Why not just SameSite=Lax? Users can host arbitrary HTML on
 * links.influencerbutler.com, which is SAME-SITE with www.influencerbutler.com.
 * Same-site requests carry Lax cookies and send `Sec-Fetch-Site: same-site`, so
 * a malicious hosted page could POST to /api/admin/* as a logged-in admin.
 * Treating `same-site` as safe (as the old check did) is therefore wrong; only
 * `same-origin` (or `none`) is.
 *
 * Rule for a mutating request (POST/PUT/PATCH/DELETE):
 *   1. Authorization: Bearer ...  -> not ambient-cookie auth, route checks it. Pass.
 *   2. Sec-Fetch-Site is same-origin or none, OR Origin / Referer is exactly one
 *      of our own origins. Otherwise 403.
 *   3. If a body is sent it must be application/json (the three content types an
 *      attacker form can send cross-site are text/plain, urlencoded, multipart).
 *
 * Applied centrally from src/middleware.ts (see csrfForApiRequest) so new
 * routes are covered by default; withCsrfGuard() is the same check for use
 * around an individual handler.
 *
 * Dependencies: none (pure; works in middleware and route handlers).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const DEFAULT_SITE_ORIGIN = "https://www.influencerbutler.com";

/** Paths that mutate admin state: guarded unconditionally (cookie or not). */
const ADMIN_LIKE_PREFIXES = [
  "/api/admin/",
  "/api/affiliates/admin-",
  "/api/affiliates/approve",
  "/api/affiliates/reject",
];

const SUPABASE_AUTH_COOKIE_RE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

export function isMutating(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isAdminLikePath(pathname: string): boolean {
  return ADMIN_LIKE_PREFIXES.some((p) => pathname.startsWith(p));
}

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Origins that count as "us": the request's own origin, Host, and SITE_URL. */
export function ownOrigins(request: Request, extra: Array<string | undefined> = []): Set<string> {
  const set = new Set<string>();
  const add = (v: string | null | undefined) => {
    const o = originOf(v);
    if (o) set.add(o);
  };
  add(request.url);
  add(process.env.SITE_URL);
  add(process.env.NEXT_PUBLIC_SITE_URL);
  add(DEFAULT_SITE_ORIGIN);
  const host = request.headers.get("host");
  if (host) {
    add(`https://${host}`);
    // Local development only.
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) add(`http://${host}`);
  }
  for (const e of extra) add(e);
  return set;
}

/** True when the browser positively identifies the request as coming from us. */
export function isTrustedBrowserOrigin(request: Request, extraOrigins: string[] = []): boolean {
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;

  const own = ownOrigins(request, extraOrigins);
  const origin = h.get("origin");
  if (origin) {
    // Origin must be a bare origin (no path) that exactly matches one of ours.
    const o = originOf(origin);
    return o !== null && o === origin && own.has(o);
  }
  const referer = originOf(h.get("referer"));
  return referer !== null && own.has(referer);
}

/** A declared non-JSON content type on a request that is not known to be empty. */
function hasNonJsonBody(request: Request): boolean {
  const ct = request.headers.get("content-type");
  if (!ct) return false;
  if (request.headers.get("content-length") === "0") return false;
  return !isJsonContentType(request);
}

function isJsonContentType(request: Request): boolean {
  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  return ct.startsWith("application/json") || /^application\/[\w.+-]+\+json\b/.test(ct);
}

export function hasBearer(request: Request): boolean {
  return /^bearer\s+\S+/i.test(request.headers.get("authorization") ?? "");
}

export type CsrfOptions = {
  /** Require application/json when a body is present. Default true. */
  requireJson?: boolean;
  /** Guard even when no Supabase auth cookie is present. Default false. */
  always?: boolean;
  extraOrigins?: string[];
};

/**
 * Returns a 403/415 Response when the request fails the guard, else null.
 * Safe methods and Bearer-authenticated requests always pass.
 */
export function csrfViolation(request: Request, opts: CsrfOptions = {}): Response | null {
  if (!isMutating(request.method)) return null;
  if (hasBearer(request)) return null;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const hasSessionCookie = SUPABASE_AUTH_COOKIE_RE.test(cookieHeader);
  // Cookie-less requests cannot ride a victim's session; nothing to protect.
  if (!opts.always && !hasSessionCookie) return null;

  if (!isTrustedBrowserOrigin(request, opts.extraOrigins)) {
    return json(403, { error: "Cross-site request blocked" });
  }
  if ((opts.requireJson ?? true) && hasNonJsonBody(request)) {
    return json(415, { error: "Content-Type must be application/json" });
  }
  return null;
}

/**
 * Middleware entry point: picks the policy from the path. Admin-like routes
 * are always guarded; every other mutating /api route is guarded whenever a
 * Supabase session cookie rides along.
 */
export function csrfForApiRequest(request: Request, pathname: string): Response | null {
  if (!isMutating(request.method)) return null;
  return csrfViolation(request, { always: isAdminLikePath(pathname) });
}

/** Wrap a single route handler with the same guard. */
export function withCsrfGuard<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Response | Promise<Response>,
  opts: CsrfOptions = { always: true },
) {
  return async (request: Request, ...args: A): Promise<Response> => {
    const blocked = csrfViolation(request, opts);
    if (blocked) return blocked;
    return handler(request, ...args);
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
