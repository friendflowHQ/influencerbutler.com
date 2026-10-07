/**
 * Best-effort client IP for rate limiting and audit logs.
 *
 * On Vercel the platform overwrites x-forwarded-for / x-real-ip with the real
 * client address, so those are preferred over cf-connecting-ip (which a client
 * can set freely when the request does not actually transit Cloudflare).
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  const first = (v: string | null) => (v ?? "").split(",")[0].trim();
  return (
    first(h.get("x-vercel-forwarded-for")) ||
    first(h.get("x-real-ip")) ||
    first(h.get("x-forwarded-for")) ||
    first(h.get("cf-connecting-ip")) ||
    "unknown"
  );
}
