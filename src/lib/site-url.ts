/**
 * The canonical public origin of the site. Never derive redirect targets from
 * request headers such as x-forwarded-host / Host: a spoofed Host header would
 * turn a redirect into an open redirect or poison links in emails.
 */
const DEFAULT_SITE_URL = "https://www.influencerbutler.com";

export function siteUrl(): string {
  const raw = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/**
 * Base URL for building redirects. Always the fixed site URL in production;
 * outside production the local request origin is used so dev redirects stay on
 * localhost.
 */
export function redirectBase(requestOrigin?: string): string {
  if (process.env.NODE_ENV !== "production" && requestOrigin) return requestOrigin;
  return siteUrl();
}
