// Same-origin assertion for state-changing admin/affiliate POSTs.
//
// The Supabase auth cookie is SameSite=Lax, so a cross-site POST already arrives
// without the cookie (and 403s at the permission gate). This is belt-and-braces:
// an explicit server-side origin check so the CSRF protection does not rest
// solely on a third-party cookie default. Reject only when we have positive
// evidence the request is cross-site; absence of the headers is allowed so
// server-to-server and same-origin fetches (which set Origin) keep working.

/** True when the request is safe to treat as same-origin. */
export function isSameOrigin(request: Request): boolean {
  // Fetch metadata is the strongest signal when the browser sends it.
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    // same-origin / same-site / none (direct nav) are fine; only cross-site is not.
    return site !== "cross-site";
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const host = request.headers.get("host");
      return !!host && new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // No Origin and no Sec-Fetch-Site: not a browser cross-site form POST
  // (those always carry Origin). Allow it; the permission gate still applies.
  return true;
}

/**
 * Returns a 403 Response when the request is cross-site, else null. Call at the
 * top of a state-changing route:
 *
 *   const bad = crossSiteBlocked(request);
 *   if (bad) return bad;
 */
export function crossSiteBlocked(request: Request): Response | null {
  if (isSameOrigin(request)) return null;
  return new Response(JSON.stringify({ error: "Cross-site request blocked" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
