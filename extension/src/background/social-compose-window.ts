import { getSettings } from "../storage/store";
import { getFlags } from "../flags/cache";
import type { SocialComposeContext } from "../shared/social";
import { isAndroid } from "../shared/platform";

// The right-click entry point and the compose-window opener for the "click an
// image, schedule a post" flow. The compose surface is a small extension popup
// window (compose.html) rather than an in-page overlay, so it works identically
// on any site (a retailer grid, Instagram, Pinterest, a blog) with no per-site
// host permission and one stylesheet.

const CONTEXT_MENU_ID = "ib-social-schedule";
const COMPOSE_WIDTH = 460;
const COMPOSE_HEIGHT = 720;

/** Open the compose window, carrying the page context in the URL query. */
export async function openComposeWindow(context: SocialComposeContext): Promise<void> {
  const url = new URL(chrome.runtime.getURL("compose.html"));
  if (context.imageUrl) url.searchParams.set("src", context.imageUrl);
  if (context.pageUrl) url.searchParams.set("page", context.pageUrl);
  if (context.title) url.searchParams.set("title", context.title);
  // Android extension browsers have no floating popup windows (and may not
  // expose chrome.windows at all): open compose as a normal tab there.
  if (!chrome.windows?.create || (await isAndroid())) {
    await chrome.tabs.create({ url: url.toString() }).catch(() => undefined);
    return;
  }
  try {
    await chrome.windows.create({
      url: url.toString(),
      type: "popup",
      width: COMPOSE_WIDTH,
      height: COMPOSE_HEIGHT,
    });
  } catch {
    // A window may fail to open in rare states (e.g. no focused window); fall
    // back to a plain tab so the creator still reaches the compose page.
    await chrome.tabs.create({ url: url.toString() }).catch(() => undefined);
  }
}

/** Whether the schedule tool is on for this user and not remotely disabled. */
async function scheduleEnabled(): Promise<boolean> {
  try {
    const [settings, flags] = await Promise.all([getSettings(), getFlags()]);
    if (flags) {
      if (flags.disableAll) return false;
      if (flags.disabledTools.includes("socialSchedule")) return false;
    }
    return settings.tools.socialSchedule !== false;
  } catch {
    return true; // never let a settings read error hide a user-invoked action
  }
}

/** Create or remove the right-click menu item to match the current setting. */
export async function reconcileContextMenu(): Promise<void> {
  // No context menus on Android extension browsers (no right-click); the
  // popup, tile menu, and HUD Actions entry points still open compose.
  if (!chrome.contextMenus) return;
  const on = await scheduleEnabled();
  // Remove first so this is idempotent across worker restarts and setting flips.
  await new Promise<void>((resolve) => {
    try {
      chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
        void chrome.runtime.lastError; // ignore "no such menu" on first run
        resolve();
      });
    } catch {
      resolve();
    }
  });
  if (!on) return;
  try {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Schedule to Social Posting Butler",
      contexts: ["image"],
    });
  } catch {
    // create can throw if the id already exists in a rare race; safe to ignore.
  }
}

/** Wire the context-menu lifecycle. Call once from the background entry. */
export function initSocialContextMenu(): void {
  if (!chrome.contextMenus?.onClicked) return;
  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    void openComposeWindow({
      imageUrl: typeof info.srcUrl === "string" ? info.srcUrl : null,
      pageUrl: typeof info.pageUrl === "string" ? info.pageUrl : null,
      title: null,
    });
  });
  // Keep the menu in sync when the creator toggles the tool or a kill flag lands.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void reconcileContextMenu();
  });
  void reconcileContextMenu();
}
