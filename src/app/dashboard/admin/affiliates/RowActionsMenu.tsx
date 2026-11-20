"use client";

// Compact "⋯" overflow menu for the roster's secondary row actions. Keeps the
// roster dense: one primary action (View) stays visible, the rest live here.
// Opens on click, closes on Esc, outside click, or after choosing an item, and
// supports arrow-key navigation between items.

import { useEffect, useId, useRef, useState } from "react";

export type RowMenuItem = {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

const ITEM_CLASS =
  "block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#c2410c] focus:bg-orange-50 focus:outline-none disabled:opacity-60";

export default function RowActionsMenu({
  label,
  items,
  up = false,
}: {
  /** Accessible name, e.g. "More actions for Kay Green". */
  label: string;
  items: RowMenuItem[];
  /** Open upward (for the last rows, so the menu is not clipped by the table). */
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      rootRef.current?.querySelector<HTMLElement>("[role='menuitem']:not([disabled])")?.focus();
    }
  }, [open]);

  if (items.length === 0) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const els = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? [],
    );
    if (els.length === 0) return;
    e.preventDefault();
    const idx = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
    els[next].focus();
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-[#f97316] hover:bg-orange-50 hover:text-[#c2410c]"
      >
        <span aria-hidden="true">⋯</span>
        <span className="sr-only">More</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute right-0 z-20 min-w-[10rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${up ? "bottom-full mb-1" : "mt-1"}`}
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.key}
                role="menuitem"
                href={item.href}
                onClick={() => setOpen(false)}
                className={ITEM_CLASS}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={ITEM_CLASS}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
