import { showModal, type ModalAction } from "../../ui/modal";
import { t } from "../../i18n";
import { sendToBackground, type HudStatus } from "../../shared/messages";
import { getState, patchState } from "../../storage/store";
import {
  APP_TRIAL_URL,
  EXTENSION_FEEDBACK_URL,
  FACEBOOK_GROUP_URL,
  NUDGE_APP_DELAY_MS,
  NUDGE_COMMUNITY_DELAY_MS,
  NUDGE_FB_DELAY_MS,
} from "../../shared/constants";
import type { NudgeState } from "../../storage/schema";

// Re-engagement nudges shown in-page. Called once per page load from the
// content script after the tools render. On the very first use it just records
// firstUseAt (via the background, which also schedules the notification
// alarms). On later visits, once enough time has passed, it shows at most one
// modal: the Facebook-group invite from day 1, then the free-app invite from
// day 3. The matching OS notification and this modal each fire once, and either
// one being acted on suppresses the other (see NudgeState).

type NudgeKey = "fbGroup" | "appDownload" | "communityNotice";

export async function maybeShowNudge(): Promise<void> {
  const state = await getState();

  if (state.firstUseAt === null) {
    // First real use: start the clock. The background sets firstUseAt and
    // schedules the day-1 / day-3 / day-5 notification alarms. Nothing is due yet.
    await sendToBackground<void>({ kind: "MARK_FIRST_USE" });
    return;
  }

  const elapsed = Date.now() - state.firstUseAt;

  if (dueForModal(state.nudges.fbGroup, elapsed, NUDGE_FB_DELAY_MS)) {
    showFbModal();
    return;
  }

  if (dueForModal(state.nudges.appDownload, elapsed, NUDGE_APP_DELAY_MS)) {
    // The app invite is a conversion prompt; skip it for anyone who already has
    // the desktop app running.
    const hud = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
    if (!hud.connected) showAppModal();
    return;
  }

  if (dueForModal(state.nudges.communityNotice, elapsed, NUDGE_COMMUNITY_DELAY_MS)) {
    showCommunityModal();
  }
}

function dueForModal(nudge: NudgeState, elapsed: number, delay: number): boolean {
  return elapsed >= delay && nudge.modalShownAt === null && nudge.actedAt === null;
}

async function markShown(key: NudgeKey): Promise<void> {
  await patchState((s) => {
    s.nudges[key].modalShownAt = Date.now();
  });
}

async function markActed(key: NudgeKey, url: string): Promise<void> {
  await patchState((s) => {
    s.nudges[key].actedAt = Date.now();
  });
  // Anchors in the overlay's shadow DOM do not navigate reliably, and the FB
  // group is off our origin, so route every open through the background's
  // allowlisted opener.
  void sendToBackground<void>({ kind: "OPEN_URL", url });
}

// Records that the user resolved a nudge without opening anything. Used by the
// community notice's "I understand" acknowledgement, which just closes.
async function markActedNoOpen(key: NudgeKey): Promise<void> {
  await patchState((s) => {
    s.nudges[key].actedAt = Date.now();
  });
}

function showFbModal(): void {
  void markShown("fbGroup");
  showModal({
    title: t().nudgeFbTitle,
    lines: [t().nudgeFbBody],
    closeLabel: t().nudgeCloseLabel,
    actions: [
      {
        label: t().nudgeFbJoin,
        variant: "primary",
        onClick: () => void markActed("fbGroup", FACEBOOK_GROUP_URL),
      },
      {
        label: t().nudgeFbReport,
        variant: "secondary",
        onClick: () => void markActed("fbGroup", EXTENSION_FEEDBACK_URL),
      },
      { label: t().nudgeMaybeLater, variant: "link", onClick: () => {} },
    ],
  });
}

// Day-5 community notice. Warmly invites the user to the group, then makes clear
// it is for tips (not bug reports / complaints / billing) and points issues at
// Feedback Butler. "I understand" is the primary acknowledgement; a secondary
// action jumps straight to Feedback Butler. Shown once (markShown), and either
// action resolves the nudge so the matching OS notification is suppressed.
function showCommunityModal(): void {
  void markShown("communityNotice");
  showModal({
    title: t().nudgeCommunityTitle,
    lines: [t().nudgeCommunityBody],
    note: t().nudgeCommunityNote,
    closeLabel: t().nudgeCloseLabel,
    actions: [
      {
        label: t().nudgeCommunityUnderstand,
        variant: "primary",
        onClick: () => void markActedNoOpen("communityNotice"),
      },
      {
        label: t().nudgeCommunityReport,
        variant: "secondary",
        onClick: () => void markActed("communityNotice", EXTENSION_FEEDBACK_URL),
      },
      {
        label: t().nudgeFbJoin,
        variant: "link",
        onClick: () => void markActed("communityNotice", FACEBOOK_GROUP_URL),
      },
    ],
  });
}

function showAppModal(): void {
  void markShown("appDownload");
  const os = detectOs();
  const actions: ModalAction[] = [];

  if (os === "windows") {
    actions.push({
      label: t().nudgeAppDownloadWindows,
      variant: "primary",
      onClick: () => void markActed("appDownload", appUrl("win")),
    });
  } else if (os === "mac") {
    actions.push({
      label: t().nudgeAppDownloadMac,
      variant: "primary",
      onClick: () => void markActed("appDownload", appUrl("mac-arm")),
    });
    actions.push({
      label: t().nudgeAppIntelMac,
      variant: "link",
      onClick: () => void markActed("appDownload", appUrl("mac-intel")),
    });
  } else {
    actions.push({
      label: t().nudgeAppDownloadGeneric,
      variant: "primary",
      onClick: () => void markActed("appDownload", appUrl()),
    });
  }

  actions.push({ label: t().nudgeMaybeLater, variant: "secondary", onClick: () => {} });

  showModal({
    title: t().nudgeAppTitle,
    lines: [t().nudgeAppBody],
    note: t().nudgeAppFree,
    closeLabel: t().nudgeCloseLabel,
    actions,
  });
}

// The download route resolves the latest Windows/Mac build and, without an os
// hint, auto-detects from the User-Agent. src tags the click for analytics.
function appUrl(os?: "win" | "mac-arm" | "mac-intel"): string {
  const params = new URLSearchParams({ src: "ext-nudge" });
  if (os) params.set("os", os);
  return `${APP_TRIAL_URL}?${params.toString()}`;
}

function detectOs(): "windows" | "mac" | "other" {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  return "other";
}
