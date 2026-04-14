"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useKeyboardShortcutsContext } from "@/contexts/KeyboardShortcutsContext";
import type { ShortcutDef } from "@/hooks/useKeyboardShortcuts";

function KeyCombo({ shortcut }: { shortcut: ShortcutDef }) {
  const kbdClass =
    "inline-flex min-w-[1.5rem] items-center justify-center rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700";

  if (shortcut.chord) {
    return (
      <span className="flex items-center gap-1">
        <kbd className={kbdClass}>{shortcut.chord}</kbd>
        <span className="text-[10px] text-slate-400">then</span>
        <kbd className={kbdClass}>{shortcut.key}</kbd>
      </span>
    );
  }

  return <kbd className={kbdClass}>{shortcut.key === "?" ? "?" : shortcut.key}</kbd>;
}

function ShortcutGroup({ category, shortcuts }: { category: string; shortcuts: ShortcutDef[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {category}
      </h3>
      <div className="space-y-1.5">
        {shortcuts.map((s) => {
          const key = s.chord ? `${s.chord}+${s.key}` : s.key;
          return (
            <div key={key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-600">{s.description}</span>
              <KeyCombo shortcut={s} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ShortcutHelpOverlay() {
  const { isHelpOpen, setHelpOpen, shortcuts } = useKeyboardShortcutsContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isHelpOpen) return null;

  // Group by category, preserving order
  const categoryOrder: string[] = [];
  const grouped = new Map<string, ShortcutDef[]>();
  for (const s of shortcuts) {
    // Skip Escape and empty descriptions from display
    if (s.key === "Escape") continue;
    if (!s.description) continue;
    if (!grouped.has(s.category)) {
      categoryOrder.push(s.category);
      grouped.set(s.category, []);
    }
    grouped.get(s.category)!.push(s);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={() => setHelpOpen(false)}
        aria-label="Close shortcuts overlay"
      />

      {/* Card */}
      <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="grid gap-6 md:grid-cols-2">
            {categoryOrder.map((cat) => (
              <ShortcutGroup key={cat} category={cat} shortcuts={grouped.get(cat)!} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3">
          <p className="text-[11px] text-slate-400">
            Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px]">?</kbd> to toggle this overlay
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
