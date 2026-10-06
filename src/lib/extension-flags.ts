/**
 * extension-flags.ts - the remote operational flags the free Chrome extension
 * polls. This is the site-controlled kill switch: it can turn off any single
 * tool (or the whole extension) on users' browsers, and push corrected DOM
 * selector lists, WITHOUT a Chrome Web Store review. When Amazon changes
 * something and a tool starts misbehaving in the wild, flipping a flag here
 * reaches every browser on its next poll (minutes), instead of the days a
 * store update takes.
 *
 * Source of truth: the EXTENSION_FLAGS environment variable, a JSON object.
 * Change it in the Vercel dashboard and redeploy (a one-click "Redeploy" with
 * no code change) to push new flags. Unset or invalid JSON means "no flags"
 * (everything on), so a typo can never take the extension down.
 *
 * Shape (every field optional):
 *   {
 *     "disableAll": false,
 *     "disabledTools": ["storefront", "searchOverlay"],
 *     "selectorOverrides": { "searchResultTile": ["div.s-result-item[data-asin]"] },
 *     "notice": "We paused the storefront check while Amazon settles a change.",
 *     "events": [{ "id": "prime-big-deal-days-2026", "retailers": ["amazon"],
 *                  "startsAt": "2026-10-06T07:00:00Z", "endsAt": "2026-10-09T07:00:00Z" }]
 *   }
 *
 * `disabledTools` entries are Settings["tools"] keys in the extension. Unknown
 * keys are ignored by the client, so this list can name a tool the installed
 * build does not have yet. `selectorOverrides` keys are SelectorId values in
 * the extension's selector registry.
 */
import { createHash } from "node:crypto";

export type ExtensionFlags = {
  // Content hash of the payload below; the client uses it as an ETag.
  version: string;
  disableAll: boolean;
  disabledTools: string[];
  selectorOverrides: Record<string, string[]>;
  notice: string | null;
  // Event-day windows; ISO dates. See extension/src/deals/events.ts.
  events: Array<{ id: string; retailers: ("amazon" | "walmart")[]; startsAt: string; endsAt: string }>;
};

const MAX_EVENTS = 12;

function normalizeEvents(value: unknown): ExtensionFlags["events"] {
  if (!Array.isArray(value)) return [];
  const out: ExtensionFlags["events"] = [];
  for (const item of value) {
    if (out.length >= MAX_EVENTS) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim().slice(0, 60) : "";
    const start = typeof o.startsAt === "string" ? Date.parse(o.startsAt) : NaN;
    const end = typeof o.endsAt === "string" ? Date.parse(o.endsAt) : NaN;
    const retailers = (Array.isArray(o.retailers) ? o.retailers : []).filter(
      (r): r is "amazon" | "walmart" => r === "amazon" || r === "walmart",
    );
    if (!id || Number.isNaN(start) || Number.isNaN(end) || end <= start || retailers.length === 0) continue;
    out.push({ id, retailers: [...new Set(retailers)], startsAt: o.startsAt as string, endsAt: o.endsAt as string });
  }
  return out;
}

// Defensive caps mirroring the client sanitizer, so the served payload stays
// bounded even if the env var is set to something huge by mistake.
const MAX_DISABLED_TOOLS = 50;
const MAX_OVERRIDE_KEYS = 60;
const MAX_SELECTORS_PER_KEY = 12;
const MAX_SELECTOR_LEN = 300;
const MAX_KEY_LEN = 60;
const MAX_NOTICE_LEN = 300;

function cleanStringArray(value: unknown, cap: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) out.push(trimmed.slice(0, maxLen));
    if (out.length >= cap) break;
  }
  return out;
}

function normalize(raw: unknown): Omit<ExtensionFlags, "version"> {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const overridesIn =
    obj.selectorOverrides && typeof obj.selectorOverrides === "object"
      ? (obj.selectorOverrides as Record<string, unknown>)
      : {};
  const selectorOverrides: Record<string, string[]> = {};
  for (const [id, sels] of Object.entries(overridesIn)) {
    if (Object.keys(selectorOverrides).length >= MAX_OVERRIDE_KEYS) break;
    if (!id.trim()) continue;
    const clean = cleanStringArray(sels, MAX_SELECTORS_PER_KEY, MAX_SELECTOR_LEN);
    if (clean.length) selectorOverrides[id.trim().slice(0, MAX_KEY_LEN)] = clean;
  }

  const notice =
    typeof obj.notice === "string" && obj.notice.trim()
      ? obj.notice.trim().slice(0, MAX_NOTICE_LEN)
      : null;

  return {
    disableAll: obj.disableAll === true,
    disabledTools: cleanStringArray(obj.disabledTools, MAX_DISABLED_TOOLS, MAX_KEY_LEN),
    selectorOverrides,
    notice,
    events: normalizeEvents(obj.events),
  };
}

// Exported for tests: the version is a short content hash of the normalized
// payload, so any change to the flags changes the ETag automatically (the
// admin never has to bump a version by hand).
export function versionOf(payload: Omit<ExtensionFlags, "version">): string {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function readExtensionFlags(): ExtensionFlags {
  const raw = process.env.EXTENSION_FLAGS;
  let parsed: unknown = {};
  if (raw && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Never let a malformed flag config break the feed: log and serve
      // "no flags" so the extension keeps working normally.
      console.error("EXTENSION_FLAGS is not valid JSON; serving no flags", error);
      parsed = {};
    }
  }
  const payload = normalize(parsed);
  return { version: versionOf(payload), ...payload };
}
