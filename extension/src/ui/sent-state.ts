import { t } from "../i18n";

// "Sent" confirmation for every control that pushes something to the desktop app.
// A successful send flips the control to "✓ Sent" so the creator can see it
// landed, and the control is never disabled by this: sending again is always
// one click away (the app dedupes where it matters).

const SENT_RESTORE_MS = 6000;

const originals = new WeakMap<HTMLElement, string>();
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

// A button: show "✓ Sent" for a few seconds, then restore its own label.
export function flashSent(btn: HTMLElement | null | undefined): void {
  if (!btn) return;
  const pending = timers.get(btn);
  if (pending) clearTimeout(pending);
  if (!originals.has(btn)) originals.set(btn, btn.textContent ?? "");
  btn.textContent = `✓ ${t().sentLabel}`;
  btn.classList.add("sent");
  timers.set(btn, setTimeout(() => resetSent(btn), SENT_RESTORE_MS));
}

// Put a flashed button back to its own label right away (called when it is
// clicked again, so "Sending..." never gets overwritten by a stale restore).
export function resetSent(btn: HTMLElement | null | undefined): void {
  if (!btn) return;
  const pending = timers.get(btn);
  if (pending) clearTimeout(pending);
  timers.delete(btn);
  const original = originals.get(btn);
  if (original !== undefined) {
    btn.textContent = original;
    originals.delete(btn);
  }
  btn.classList.remove("sent");
}

// A menu row that is rebuilt every time the menu opens: remember what was sent
// for the life of the page so reopening the menu still shows the notice.
const sentKeys = new Set<string>();

export function wasSent(key: string): boolean {
  return sentKeys.has(key);
}

export function noteSent(key: string): void {
  sentKeys.add(key);
}

// Adds (or refreshes) the small "✓ Sent" notice at the end of a menu row. The
// row stays fully clickable, so it doubles as "send again".
export function showSentBadge(item: HTMLElement): void {
  let badge = item.querySelector<HTMLElement>(".sent-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "sent-badge";
    item.append(badge);
  }
  badge.textContent = `✓ ${t().sentLabel}`;
}
