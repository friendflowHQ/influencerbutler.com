// Remotely-served operational flags: a kill switch the site can flip to turn
// off any single tool (or the whole extension) on users' browsers without a
// Chrome Web Store review, plus optional selector-list overrides so a broken
// Amazon-DOM selector can be repaired as config, not code. The background
// worker refreshes this on the sync alarm (see background/flags.ts); content
// scripts read the cached copy and apply it before running any tool.
//
// This is the fast path for "Amazon changed something and a tool is
// misbehaving in the wild": flip the flag, and every browser picks it up on
// its next poll instead of waiting days for a store update to roll out.

// Kept in a dedicated chrome.storage.local key, separate from the main
// extension state, so it is self-contained and never entangled with the user's
// own settings (their toggles are preferences; these are operational
// overrides that always win).
const KEY = "ib-flags";

export type RemoteFlags = {
  // Content hash of the flag payload, used as the ETag for cheap 304s.
  version: string;
  // Hard kill: content scripts run no tools at all on the page.
  disableAll: boolean;
  // Settings["tools"] keys to force off, on top of the user's own choices.
  disabledTools: string[];
  // SelectorId -> replacement selector list. Repairs selector rot as config.
  selectorOverrides: Record<string, string[]>;
  // Optional short message surfaced in the popup (for example, "We paused the
  // storefront check while Amazon settles a layout change"). Admin-authored.
  notice: string | null;
};

export type StoredFlags = RemoteFlags & { fetchedAt: number };

// Defensive caps so a bad or hostile payload can never bloat storage or the
// selector registry. These are generous relative to any real flag set.
const MAX_DISABLED_TOOLS = 50;
const MAX_OVERRIDE_KEYS = 60;
const MAX_SELECTORS_PER_KEY = 12;
const MAX_SELECTOR_LEN = 300;
const MAX_TOOL_KEY_LEN = 60;
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

// Pure (exported for tests): coerce an untrusted server payload into a
// RemoteFlags with every field present and bounded. Anything malformed is
// dropped rather than throwing, so a typo in the flag config can never break
// the extension.
export function sanitizeFlags(raw: unknown): RemoteFlags {
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
    if (clean.length) selectorOverrides[id.trim().slice(0, MAX_TOOL_KEY_LEN)] = clean;
  }

  const notice = typeof obj.notice === "string" && obj.notice.trim()
    ? obj.notice.trim().slice(0, MAX_NOTICE_LEN)
    : null;

  return {
    version: typeof obj.version === "string" ? obj.version : "",
    disableAll: obj.disableAll === true,
    disabledTools: cleanStringArray(obj.disabledTools, MAX_DISABLED_TOOLS, MAX_TOOL_KEY_LEN),
    selectorOverrides,
    notice,
  };
}

export async function getFlags(): Promise<StoredFlags | null> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as StoredFlags) ?? null;
}

export async function setFlags(flags: StoredFlags): Promise<void> {
  await chrome.storage.local.set({ [KEY]: flags });
}
