// Single-key shortcuts for the search results page: j / k move between tiles,
// s shortlists the focused tile, ? shows the cheat sheet. They are plain keys, so
// they only fire when the user is not typing, no modifier is held, and the
// setting is on. The page-level work is done by the search overlay, which listens
// for the "ib-shortcut" event this module dispatches.

export type ShortcutAction = "next" | "prev" | "shortlist" | "help";

export type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
};

export type TargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
} | null;

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const TYPING_ROLES = new Set(["textbox", "combobox", "searchbox", "spinbutton", "listbox"]);

export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName && TYPING_TAGS.has(target.tagName.toUpperCase())) return true;
  const role = target.getAttribute?.("role");
  return !!role && TYPING_ROLES.has(role);
}

// Our shadow-DOM hosts carry an "ib-ext" id or class. The per-tile badge host is
// excluded: it only holds buttons, and j / k / s should still work after a click
// on a star.
export function isOwnUiHost(target: { className?: unknown; id?: string } | null): boolean {
  if (!target) return false;
  const cls = typeof target.className === "string" ? target.className : "";
  if (/tile-badge-host/.test(cls)) return false;
  return /ib-ext/.test(cls) || (typeof target.id === "string" && target.id.startsWith("ib-ext"));
}

export function shortcutFor(event: KeyLike, target: TargetLike): ShortcutAction | null {
  if (event.defaultPrevented || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(target)) return null;
  switch (event.key) {
    case "j":
      return "next";
    case "k":
      return "prev";
    case "s":
      return "shortlist";
    case "?":
      return "help";
    default:
      return null;
  }
}

// The key listener lives for the page's life; `isEnabled` is read per key so the
// setting can change without reinstalling. Each dispatched event is consumed by
// the overlay only when it is active on this page, otherwise nothing happens and
// the key keeps its normal page meaning (preventDefault is called only when the
// overlay reports it handled the action).
export function installShortcuts(isEnabled: () => boolean): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    if (!isEnabled()) return;
    // Keys typed inside our own closed shadow UIs (chat bubble, report form, toolbar
    // inputs, tray) reach window with the shadow HOST as the target, and a closed
    // root hides the real input from composedPath, so recognize our hosts instead.
    const target = event.target as TargetLike & { className?: unknown; id?: string };
    if (isOwnUiHost(target)) return;
    const action = shortcutFor(event, target);
    if (!action) return;
    const detail = { action, handled: false };
    window.dispatchEvent(new CustomEvent("ib-shortcut", { detail }));
    if (detail.handled) event.preventDefault();
  };
  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}
