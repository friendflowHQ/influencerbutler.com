import { isPaired, pollNotifications } from "./hud-bridge";
import type { AppNotification } from "../transport/hud-commands";
import { log } from "../shared/log";

// The extension half of the reverse channel: on the sync alarm, poll the paired
// app for anything it wants to show the creator (a butler run finished, earnings
// synced) and raise an OS notification for each new one. The cursor lives in its
// own storage key (no schema bump) so a poll only ever shows what is genuinely
// new. First poll after pairing adopts the app's current position WITHOUT
// replaying history, so connecting never dumps a stack of stale notifications.

const CURSOR_KEY = "ib-notify-cursor";
const NOTIF_PREFIX = "ib-app-";

async function getCursor(): Promise<number> {
  try {
    const out = await chrome.storage.local.get(CURSOR_KEY);
    const value = out?.[CURSOR_KEY];
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

async function setCursor(value: number): Promise<void> {
  try {
    await chrome.storage.local.set({ [CURSOR_KEY]: value });
  } catch {
    // storage unavailable; next poll simply re-reads the old cursor
  }
}

export async function pollAppNotifications(): Promise<void> {
  // No point probing loopback if the app was never paired.
  if (!(await isPaired())) return;

  const cursor = await getCursor();
  const res = await pollNotifications(cursor);
  if (!res.ok) return;

  // First ever poll (cursor 0): jump to the app's current high-water mark so we
  // only notify on things that happen from here on, never the backlog.
  if (cursor === 0) {
    if (res.cursor > 0) await setCursor(res.cursor);
    return;
  }

  for (const entry of res.entries) fireNotification(entry);
  if (res.cursor !== cursor) await setCursor(res.cursor);
}

function fireNotification(entry: AppNotification): void {
  try {
    chrome.notifications.create(`${NOTIF_PREFIX}${entry.seq}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: entry.title || "Influencer Butler",
      message: entry.body || "",
    });
  } catch (error) {
    log("app-notify", "could not show notification", error);
  }
}
