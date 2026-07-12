// Instagram DOM fallbacks + block-detection regexes for the Goldmine crawl.
//
// The crawl resolves creators and emails through Instagram's own web JSON
// endpoints (see endpoints.ts); this file is the LAST-RESORT DOM path for when
// a JSON shape changes, plus the block patterns that let us detect-to-stop.
// Aria-label / structural selectors only, never Instagram's hashed class names
// (they change on every deploy). Ordered fallbacks + miss telemetry mirror the
// Amazon registry in src/amazon/selectors.ts.
//
// Ported from the desktop app's workspaces/instagram-goldmine/
// instagram-selectors.js. Re-verify against a live logged-in session before
// shipping: Instagram's DOM changes often (desktop set last verified 2026-06-22).

export type IgSelectorId =
  | "postGridLinks"
  | "profileEmailButton"
  | "bioRoot"
  | "bioMoreButton"
  | "externalLink"
  | "metaDescription"
  | "posterUsername";

const REGISTRY: Record<IgSelectorId, string[]> = {
  // Grid tiles under /explore/tags/<tag>/ or a profile. Instagram now prefixes
  // tiles with the owner handle (/<user>/p/<id>/), so match the "/p/" or
  // "/reel/" path segment anywhere, scoped to <main>.
  postGridLinks: ['main a[href*="/p/"]', 'main a[href*="/reel/"]'],
  // Professional/business accounts render a contact-email "Email" button as a
  // mailto: anchor in the profile header/action row.
  profileEmailButton: ['header a[href^="mailto:"]', 'main a[href^="mailto:"]'],
  bioRoot: ["main header section + section", "main header section:last-of-type"],
  bioMoreButton: ['main header [role="button"][aria-label="more"]'],
  externalLink: ['main header a[href*="l.instagram.com"]', 'main header a[href^="https://"]'],
  metaDescription: ['meta[name="description"]', 'meta[property="og:description"]'],
  posterUsername: ['article header a[href]:not([href*="/p/"]):not([href*="/reel/"])'],
};

const misses = new Map<string, number>();

export function igQuery<T extends Element = HTMLElement>(
  doc: ParentNode,
  id: IgSelectorId,
): T | null {
  for (const sel of REGISTRY[id]) {
    try {
      const found = doc.querySelector<Element>(sel);
      if (found) return found as T;
    } catch {
      // an invalid selector strategy must not kill the rest
    }
  }
  recordMiss(id);
  return null;
}

export function igQueryAll<T extends Element = HTMLElement>(
  doc: ParentNode,
  id: IgSelectorId,
): T[] {
  for (const sel of REGISTRY[id]) {
    try {
      const found = doc.querySelectorAll<Element>(sel);
      if (found.length > 0) return Array.from(found) as T[];
    } catch {
      // continue to next strategy
    }
  }
  recordMiss(id);
  return [];
}

function recordMiss(id: string): void {
  misses.set(id, (misses.get(id) ?? 0) + 1);
}

export function drainIgSelectorMisses(): Array<{ id: string; count: number }> {
  const out = Array.from(misses, ([id, count]) => ({ id, count }));
  misses.clear();
  return out;
}

// Page-content signals that Instagram has stopped us (rate limit, challenge,
// temporary block, "try later"). detection-to-STOP, NOT detection-to-evade:
// when any of these match we end the run cleanly rather than push through.
export const INSTAGRAM_BLOCK_PATTERNS: readonly RegExp[] = Object.freeze([
  /please\s+wait\s+a\s+few\s+minutes/i, // EN
  /try\s+again\s+later/i, // EN
  /we\s+restrict\s+certain\s+activity/i, // EN
  /suspicious\s+login\s+attempt/i, // EN
  /this\s+account\s+is\s+temporarily\s+blocked/i, // EN
  /couldn'?t\s+refresh\s+feed/i, // EN
  /espera\s+unos\s+minutos/i, // ES
  /int[eé]ntalo\s+de\s+nuevo\s+m[aá]s\s+tarde/i, // ES
  /restringimos\s+ciertas\s+actividades/i, // ES
  /veuillez\s+patienter\s+quelques?\s+minutes?/i, // FR
  /r[eé]essayez\s+plus\s+tard/i, // FR
  /nous\s+limitons\s+certaines\s+activit[eé]s/i, // FR
  /bitte\s+warte\s+einige\s+minuten/i, // DE
  /versuche\s+es\s+sp[aä]ter/i, // DE
  /aguarde\s+alguns\s+minutos/i, // PT
  /tente\s+novamente\s+mais\s+tarde/i, // PT
]);

// URL fragments Instagram redirects to when access is blocked. Matched as a
// substring against the current URL (or a fetched response's redirected URL).
export const INSTAGRAM_BLOCK_URL_PATTERNS: ReadonlyArray<{ rx: RegExp; reason: string }> =
  Object.freeze([
    { rx: /\/accounts\/login\b/i, reason: "login-required" },
    { rx: /\/challenge\//i, reason: "challenge-required" },
    { rx: /\/accounts\/suspended/i, reason: "account-suspended" },
    { rx: /\/accounts\/disabled/i, reason: "account-disabled" },
  ]);

// True when a URL looks like a block/redirect target. Returns the reason, or
// null when the URL is fine.
export function blockReasonForUrl(url: string): string | null {
  for (const { rx, reason } of INSTAGRAM_BLOCK_URL_PATTERNS) {
    if (rx.test(url)) return reason;
  }
  return null;
}

// True when a blob of page text carries a rate-limit / "try later" template.
export function looksBlockedByText(text: string): boolean {
  const sample = String(text || "").slice(0, 5000);
  return INSTAGRAM_BLOCK_PATTERNS.some((rx) => rx.test(sample));
}
