// Summary: Persists the "Desktop app activity" log (what the extension sent to or
//   received from the desktop app, and the result). Shown in the extension
//   Settings and attached to feedback reports and chat-bubble logs so support can
//   see why something did not reach the app. Everything here is best-effort and
//   must never throw: logging cannot be allowed to break a send.
import {
  appendActivity,
  formatActivityLog,
  type DesktopActivityEntry,
  type NewActivity,
} from "../shared/desktop-activity";

// Its own chrome.storage.local key (no schema bump), like the other small stores.
const ACTIVITY_KEY = "ib-desktop-activity";

// Appends are read-modify-write; a burst of sends would otherwise race and drop
// entries, so they run one at a time.
let chain: Promise<void> = Promise.resolve();

export function recordActivity(entry: NewActivity): void {
  chain = chain.then(async () => {
    try {
      const got = await chrome.storage.local.get(ACTIVITY_KEY);
      const stored = got?.[ACTIVITY_KEY];
      const list = Array.isArray(stored) ? (stored as DesktopActivityEntry[]) : [];
      await chrome.storage.local.set({ [ACTIVITY_KEY]: appendActivity(list, entry, Date.now()) });
    } catch {
      // storage unavailable (or no chrome global under test): drop this entry
    }
  });
}

export async function getActivity(): Promise<DesktopActivityEntry[]> {
  await chain;
  try {
    const got = await chrome.storage.local.get(ACTIVITY_KEY);
    const stored = got?.[ACTIVITY_KEY];
    return Array.isArray(stored) ? (stored as DesktopActivityEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearActivity(): Promise<void> {
  await chain;
  try {
    await chrome.storage.local.remove(ACTIVITY_KEY);
  } catch {
    // nothing to clear
  }
}

// The text block for feedback reports / chat-bubble logs.
export async function activityLogText(): Promise<string> {
  return formatActivityLog(await getActivity());
}
