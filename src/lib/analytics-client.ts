/**
 * Client-side GA4 event helper. Fires named events into the gtag instance that
 * src/app/layout.tsx already loads (G-S1TC1QLYNN). It no-ops safely on the
 * server and before gtag is ready, so callers never have to guard. Use this
 * instead of touching window.gtag directly, so every funnel and course event
 * goes through one place and stays consistent.
 *
 * Event names in use (all snake_case, no em dashes per project rule):
 *   cta_trial_click     - a "Start free trial" / download CTA was clicked
 *   download_page_view  - the /download chooser page was reached
 *   checkout_start      - a Lemon Squeezy checkout was launched
 *   course_module_view  - a free-course module page was opened
 *   course_module_complete - every step in a course module got checked off
 *
 * The first two also fire from public/download-guidance.js so the static
 * marketing pages are covered without importing this module.
 */

export type GtagParams = Record<string, string | number | boolean | undefined>;

type GtagWindow = Window & {
  gtag?: (command: "event", eventName: string, params?: GtagParams) => void;
};

export function trackEvent(name: string, params?: GtagParams): void {
  if (typeof window === "undefined") return;
  const w = window as GtagWindow;
  try {
    if (typeof w.gtag === "function") {
      w.gtag("event", name, params);
    }
    if (process.env.NODE_ENV !== "production") {
      // Makes local verification possible without GA4 DebugView.
      console.debug("[trackEvent]", name, params ?? {});
    }
  } catch {
    // Analytics must never break the page.
  }
}

// Conversion-funnel sink (Cloudflare Analytics Engine via the licensing worker).
// Mirrors the desktop app's first-launch / walkthrough-complete beacons so all
// four stages (download-click -> installer-downloaded -> first-launch ->
// walkthrough-complete) land in one queryable dataset. GA4 above stays the
// web-side backstop; this is the unified per-stage counter.
const FUNNEL_ENDPOINT = "https://licensing.influencerbutler.com/funnel/track";

function funnelId(): string {
  try {
    let id = localStorage.getItem("ib_funnel_id");
    if (!id) {
      id = window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
      localStorage.setItem("ib_funnel_id", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function trackFunnel(
  event: "download-click" | "installer-downloaded",
  extra?: { os?: string; source?: string },
): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      event,
      id: funnelId(),
      source: extra?.source ?? "web",
      os: extra?.os,
      ts: Date.now(),
    });
    // text/plain keeps this a CORS-simple request (no preflight) and sendBeacon
    // survives the navigation the .exe download can trigger. The worker parses
    // the JSON body regardless of content-type.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(FUNNEL_ENDPOINT, new Blob([body], { type: "text/plain" }));
    } else {
      void fetch(FUNNEL_ENDPOINT, { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Analytics must never break the page.
  }
}
