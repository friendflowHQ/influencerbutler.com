// The DOM layer for the Message Templates toolbar. The Creator Connections
// Messages widget is the same floating panel Brand Keywords decorates, so we
// reuse its structure/text readers (one place changes when Amazon reshapes the
// widget) and add only what this tool needs: a reader for the composer itself,
// which Brand Keywords acknowledges but never had to locate.

import { findMessagesWidget, findThreadHeader, readThreadBrand } from "../brand-keywords/selectors";

export { findMessagesWidget, findThreadHeader, readThreadBrand };

// The reply box the creator types their message into. Amazon renders it as a
// <textarea> inside the widget (the "reply box" the widget selector already
// keys on); newer builds could swap to a contenteditable div, so fall back to
// that. Returns null when no thread is open (list view has no composer), so the
// sweep simply mounts no toolbar rather than throwing.
export function findComposer(widget: HTMLElement): HTMLElement | null {
  const textarea = widget.querySelector<HTMLTextAreaElement>("textarea");
  if (textarea) return textarea;
  const editable = widget.querySelector<HTMLElement>('[contenteditable="true"]');
  return editable ?? null;
}
