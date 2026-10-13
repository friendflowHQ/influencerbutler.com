/**
 * CORS for the three public, read-only /api/help/* routes, so the Influencer
 * Butler PHONE app (a separate origin) can read the same tutorials the desktop
 * dashboard does. Allow-list only: the phone site's two hosts plus the origins
 * a Capacitor (native app) webview uses. GET only, no credentials, and the
 * header echoes the one matched origin (never *), with Vary: Origin so caches
 * keep the responses apart.
 */

const ALLOWED_ORIGINS = new Set([
  "https://m.influencerbutler.com",
  "https://influencerbutler-mobile-web.thesocialmediaposse.workers.dev",
  // Capacitor webview origins (Android uses https://localhost, iOS capacitor://localhost).
  "https://localhost",
  "capacitor://localhost",
]);

/** The CORS headers for one request's Origin, or {} when the origin is not ours. */
export function helpCorsHeaders(origin: string | null | undefined): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET",
    Vary: "Origin",
  };
}

export const __ALLOWED_ORIGINS_FOR_TEST = ALLOWED_ORIGINS;
