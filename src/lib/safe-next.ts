/**
 * Safe post-login redirect targets ("next" parameters).
 *
 * Used by the login page, /auth/confirm and /api/auth/callback so an attacker
 * cannot craft a sign-in link that bounces the victim to another site after
 * authentication (open redirect / phishing, javascript: URLs, etc).
 *
 * A value is accepted only when it is a same-site absolute PATH that starts with
 * one of the allow-listed prefixes. Everything else collapses to the fallback.
 * Pure and dependency-free so it works in server and client components.
 */

export const ALLOWED_NEXT_PREFIXES = [
  "/dashboard",
  "/affiliates/portal",
  "/help/community",
] as const;

export const DEFAULT_NEXT = "/dashboard";

const PROBE_ORIGIN = "http://safe-next.invalid";

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    // C0 controls, DEL, and Unicode line/paragraph separators. Browsers strip
    // tabs/newlines inside URLs, so "/\t/evil.com" would otherwise become
    // "//evil.com".
    if (c <= 0x1f || c === 0x7f || c === 0x2028 || c === 0x2029) return true;
  }
  return false;
}

/**
 * Returns a safe same-site path for `raw`, or `fallback` when `raw` is missing
 * or unsafe. The returned string is the URL-normalised path + query + hash.
 */
export function resolveNext(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  if (hasControlChars(raw)) return fallback;
  // Single leading slash only: rejects "//host", "/\host", "https://host",
  // "javascript:...", "data:...", and relative paths.
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return fallback;
  if (raw.includes("\\")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PROBE_ORIGIN) return fallback;

  const path = parsed.pathname;
  const allowed = ALLOWED_NEXT_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (!allowed) return fallback;

  return `${path}${parsed.search}${parsed.hash}`;
}
