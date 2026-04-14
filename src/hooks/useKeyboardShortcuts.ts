"use client";

import { useEffect, useRef } from "react";

export type ShortcutDef = {
  key: string;
  chord?: string;
  handler: () => void;
  description: string;
  category: string;
};

type PendingChord = { key: string; timestamp: number } | null;

const CHORD_TIMEOUT = 800;

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const pendingChordRef = useRef<PendingChord>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Always allow Escape
      if (e.key === "Escape") {
        if (isInputFocused()) {
          (document.activeElement as HTMLElement)?.blur();
        }
        const esc = shortcutsRef.current.find(
          (s) => s.key === "Escape" && !s.chord,
        );
        if (esc) {
          e.preventDefault();
          esc.handler();
        }
        pendingChordRef.current = null;
        return;
      }

      // Suppress when typing in inputs
      if (isInputFocused()) return;

      // Suppress when modifier keys are held (except Shift for ?)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key;

      // Check for pending chord completion
      const pending = pendingChordRef.current;
      if (pending) {
        const elapsed = Date.now() - pending.timestamp;
        if (elapsed < CHORD_TIMEOUT) {
          const match = shortcutsRef.current.find(
            (s) => s.chord === pending.key && s.key === key,
          );
          if (match) {
            e.preventDefault();
            pendingChordRef.current = null;
            match.handler();
            return;
          }
        }
        pendingChordRef.current = null;
      }

      // Check if this key is a chord prefix
      const isChordPrefix = shortcutsRef.current.some((s) => s.chord === key);
      if (isChordPrefix) {
        e.preventDefault();
        pendingChordRef.current = { key, timestamp: Date.now() };
        return;
      }

      // Check for direct (non-chord) shortcut match
      const match = shortcutsRef.current.find(
        (s) => s.key === key && !s.chord,
      );
      if (match) {
        e.preventDefault();
        match.handler();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Expose chord reset for external use (e.g., route changes)
  return { clearChord: () => { pendingChordRef.current = null; } };
}
