import {
  APP_TRIAL_URL,
  EXTENSION_FEEDBACK_URL,
  FACEBOOK_GROUP_URL,
  NUDGE_APP_ALARM,
  NUDGE_APP_DELAY_MS,
  NUDGE_COMMUNITY_ALARM,
  NUDGE_COMMUNITY_DELAY_MS,
  NUDGE_FB_ALARM,
  NUDGE_FB_DELAY_MS,
} from "../shared/constants";
import { getState, patchState } from "../storage/store";
import { setLocale, t } from "../i18n";
import { getHudStatus } from "./hud-bridge";
import { log } from "../shared/log";

// Background half of the re-engagement nudges. Owns first-use tracking, the
// day-1 / day-3 / day-5 alarms, and the OS notifications. The content script
// owns the in-page modals; the two channels coordinate through storage.nudges
// so a user who acts on one is not nagged by the other.

type NudgeKey = "fbGroup" | "appDownload" | "communityNotice";

const ALL_KEYS: NudgeKey[] = ["fbGroup", "appDownload", "communityNotice"];

const ALARM_TO_KEY: Record<string, NudgeKey> = {
  [NUDGE_FB_ALARM]: "fbGroup",
  [NUDGE_APP_ALARM]: "appDownload",
  [NUDGE_COMMUNITY_ALARM]: "communityNotice",
};

const KEY_TO_ALARM: Record<NudgeKey, string> = {
  fbGroup: NUDGE_FB_ALARM,
  appDownload: NUDGE_APP_ALARM,
  communityNotice: NUDGE_COMMUNITY_ALARM,
};

const DELAY: Record<NudgeKey, number> = {
  fbGroup: NUDGE_FB_DELAY_MS,
  appDownload: NUDGE_APP_DELAY_MS,
  communityNotice: NUDGE_COMMUNITY_DELAY_MS,
};

// Records the first real use (first content-script run on an Amazon page) and
// schedules the notification alarms. Idempotent: only the first call sets the
// clock, but scheduling is always re-ensured so a reinstall/update recovers.
export async function markFirstUse(): Promise<void> {
  const state = await patchState((s) => {
    if (s.firstUseAt === null) s.firstUseAt = Date.now();
  });
  await ensureNudgeAlarms(state.firstUseAt);
}

// Creates the one-shot alarms for any nudge that has not notified yet. A `when`
// already in the past simply fires on the next service-worker wake. Safe to
// call repeatedly (create replaces an existing alarm of the same name).
export async function ensureNudgeAlarms(firstUseAt?: number | null): Promise<void> {
  const state = firstUseAt === undefined ? await getState() : null;
  const anchor = firstUseAt === undefined ? state!.firstUseAt : firstUseAt;
  if (anchor === null) return;
  const nudges = state ? state.nudges : (await getState()).nudges;
  for (const key of ALL_KEYS) {
    if (nudges[key].notifiedAt === null) {
      await chrome.alarms.create(KEY_TO_ALARM[key], { when: anchor + DELAY[key] });
    }
  }
}

// Returns true if the alarm was one of ours (so the caller stops here).
export function handleNudgeAlarm(name: string): boolean {
  const key = ALARM_TO_KEY[name];
  if (!key) return false;
  void fireNudge(key);
  return true;
}

async function fireNudge(key: NudgeKey): Promise<void> {
  const state = await getState();
  const nudge = state.nudges[key];
  // Already notified, or the user already acted via the in-page modal: skip.
  if (nudge.notifiedAt !== null || nudge.actedAt !== null) return;

  if (key === "appDownload") {
    // Conversion prompt: do not nudge anyone who already runs the desktop app.
    const hud = await getHudStatus();
    if (hud.connected) {
      // Mark notified so we neither re-check on every startup nor fire later.
      await patchState((s) => {
        s.nudges.appDownload.notifiedAt = Date.now();
      });
      return;
    }
  }

  applyBackgroundLocale();
  const strings = t();
  const copyByKey: Record<NudgeKey, { title: string; message: string }> = {
    fbGroup: { title: strings.nudgeFbNotifTitle, message: strings.nudgeFbNotifBody },
    appDownload: { title: strings.nudgeAppNotifTitle, message: strings.nudgeAppNotifBody },
    communityNotice: {
      title: strings.nudgeCommunityNotifTitle,
      message: strings.nudgeCommunityNotifBody,
    },
  };
  const copy = copyByKey[key];

  try {
    await chrome.notifications.create(KEY_TO_ALARM[key], {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: copy.title,
      message: copy.message,
      priority: 1,
    });
  } catch (error) {
    log("nudges", "notification failed", error);
  }

  await patchState((s) => {
    s.nudges[key].notifiedAt = Date.now();
  });
}

// Notification click: open the right URL and record that the user acted so the
// in-page modal for the same nudge is suppressed. The notification id is the
// alarm name, so the kind is recoverable even after a worker restart.
export async function handleNudgeNotificationClick(
  notificationId: string,
  open: (url: string) => Promise<void>,
): Promise<boolean> {
  const key = ALARM_TO_KEY[notificationId];
  if (!key) return false;
  const urlByKey: Record<NudgeKey, string> = {
    fbGroup: FACEBOOK_GROUP_URL,
    appDownload: `${APP_TRIAL_URL}?src=ext-nudge-notif`,
    communityNotice: `${EXTENSION_FEEDBACK_URL}?src=ext-nudge-notif`,
  };
  const url = urlByKey[key];
  await open(url);
  await patchState((s) => {
    s.nudges[key].actedAt = Date.now();
  });
  try {
    await chrome.notifications.clear(notificationId);
  } catch {
    // notification already gone; nothing to do
  }
  return true;
}

// The worker has no per-user locale override (that lives in the popup's
// settings), so resolve from the browser UI language, same as "auto".
function applyBackgroundLocale(): void {
  setLocale("auto");
}
