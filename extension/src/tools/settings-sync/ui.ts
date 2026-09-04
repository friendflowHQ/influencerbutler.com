import { showModal } from "../../ui/modal";
import { sendToBackground, type SyncApplyResult, type SyncPreviewResult } from "../../shared/messages";
import { t } from "../../i18n";

// Shared settings-sync UI, used by both the popup's Desktop-app card and the
// onboarding page's pairing step. The background does all the work (bridge +
// crypto + merge); this only drives the round-trip and the "are you sure" confirm.
// The confirm lists which settings differ by label only, never their values, so a
// secret is never printed on screen.

// The non-destructive pass: fill each side's empty fields from the other. Returns
// null when there is nothing to sync with (not paired, or the app is closed / too
// old), so the caller can simply hide any sync affordance.
export async function autoFillFromDesktop(): Promise<{
  filled: number;
  remainingDiffs: number;
} | null> {
  const r = await sendToBackground<SyncPreviewResult>({ kind: "SYNC_SETTINGS_PREVIEW" });
  if (r.status !== "ok") return null;
  return { filled: r.filled, remainingDiffs: r.diffs.length };
}

// The explicit "Sync now" flow: preview, then (only if a real conflict remains)
// raise the reconcile confirm and apply the chosen direction. Writes progress to
// `statusEl`.
export async function runSyncReconcile(statusEl: HTMLElement): Promise<void> {
  statusEl.textContent = t().syncChecking;
  const r = await sendToBackground<SyncPreviewResult>({ kind: "SYNC_SETTINGS_PREVIEW" });

  if (r.status === "not-paired") {
    statusEl.textContent = t().syncNotPaired;
    return;
  }
  if (r.status === "app-unavailable") {
    statusEl.textContent = t().syncAppOutdated;
    return;
  }

  if (r.diffs.length === 0) {
    statusEl.textContent = r.filled > 0 ? t().syncFilled(r.filled) : t().syncInSync;
    return;
  }

  showModal({
    title: t().syncConfirmTitle,
    lines: [t().syncConfirmBody(r.diffs.length), `${t().syncConfirmList} ${r.diffs.join(", ")}`],
    closeLabel: t().nudgeCloseLabel,
    actions: [
      {
        label: t().syncConfirmAppWins,
        variant: "primary",
        onClick: () => void applyDirection("app-wins", statusEl),
      },
      {
        label: t().syncConfirmExtWins,
        variant: "secondary",
        onClick: () => void applyDirection("ext-wins", statusEl),
      },
      { label: t().syncCancel, variant: "link", onClick: () => {} },
    ],
  });
}

async function applyDirection(
  direction: "app-wins" | "ext-wins",
  statusEl: HTMLElement,
): Promise<void> {
  statusEl.textContent = t().syncChecking;
  const r = await sendToBackground<SyncApplyResult>({ kind: "SYNC_SETTINGS_APPLY", direction });
  if (r.status === "ok") statusEl.textContent = t().syncDone;
  else if (r.status === "not-paired") statusEl.textContent = t().syncNotPaired;
  else statusEl.textContent = t().syncAppOutdated;
}
