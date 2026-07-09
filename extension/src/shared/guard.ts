import { warn } from "./log";

// Every tool entrypoint runs through guard(). A throw disables that tool for
// the page instead of surfacing on amazon.com: the extension must never
// visibly break the site.
const disabled = new Set<string>();

// Persistent, bounded breakage tally. warn() logs to the console, but a reload
// wipes that, so a tool that quietly stops working when Amazon changes its DOM
// is otherwise invisible. Recording a per-tool count in storage lets the
// options debug view (and support) spot selector rot without a live console.
const BREAKAGE_KEY = "ib-breakage";
const BREAKAGE_MAX_TOOLS = 40;

type BreakageEntry = { count: number; lastAt: number; lastMessage: string };
type BreakageMap = Record<string, BreakageEntry>;

function recordBreakage(toolId: string, error: unknown): void {
  // Fire-and-forget: telemetry must never take a tool down, so any storage
  // failure is swallowed the same way logging is.
  const message = (error instanceof Error ? error.message : String(error ?? "")).slice(0, 200);
  void (async () => {
    try {
      const raw = await chrome.storage.local.get(BREAKAGE_KEY);
      const map: BreakageMap = (raw?.[BREAKAGE_KEY] as BreakageMap) ?? {};
      const prev = map[toolId];
      map[toolId] = {
        count: (prev?.count ?? 0) + 1,
        lastAt: Date.now(),
        lastMessage: message,
      };
      // Cap the number of distinct tools tracked so a bug can never grow the
      // record without bound; drop the least-recently-seen when over the cap.
      const ids = Object.keys(map);
      if (ids.length > BREAKAGE_MAX_TOOLS) {
        ids.sort((a, b) => (map[a]?.lastAt ?? 0) - (map[b]?.lastAt ?? 0));
        for (const id of ids.slice(0, ids.length - BREAKAGE_MAX_TOOLS)) delete map[id];
      }
      await chrome.storage.local.set({ [BREAKAGE_KEY]: map });
    } catch {
      // storage unavailable; the console warn above is the only record
    }
  })();
}

export function guard(toolId: string, fn: () => void | Promise<void>): void {
  if (disabled.has(toolId)) return;
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((error) => {
        disabled.add(toolId);
        warn(toolId, "disabled for this page after async error", error);
        recordBreakage(toolId, error);
      });
    }
  } catch (error) {
    disabled.add(toolId);
    warn(toolId, "disabled for this page after error", error);
    recordBreakage(toolId, error);
  }
}

export function isDisabled(toolId: string): boolean {
  return disabled.has(toolId);
}
