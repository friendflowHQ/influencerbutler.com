"use client";

// Accessible confirm dialog for risky affiliate actions (reject, revoke,
// verify). Names the target and consequence in the message. Optionally asks
// for a reason (required or not) before the confirm button enables. Esc or a
// backdrop click cancels, Tab stays inside the dialog, and focus starts on the
// reason box (or Cancel) so Enter never confirms by accident.

import { useEffect, useId, useRef, useState } from "react";

export type ReasonDialogProps = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  /** When set, shows a reason textarea with this label. */
  reasonLabel?: string;
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  reasonDefault?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export default function ReasonDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  reasonLabel,
  reasonRequired = false,
  reasonPlaceholder,
  reasonDefault = "",
  busy = false,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const [reason, setReason] = useState(reasonDefault);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const reasonId = `${uid}-reason`;

  useEffect(() => {
    if (!open) return;
    setReason(reasonDefault);
    const target = reasonLabel ? reasonRef.current : cancelRef.current;
    target?.focus();
  }, [open, reasonLabel, reasonDefault]);

  if (!open) return null;

  const trimmed = reason.trim();
  const canConfirm = !busy && (!reasonLabel || !reasonRequired || trimmed.length > 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !busy) {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "textarea, button:not([disabled])",
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <div id={bodyId} className="mt-2 text-sm text-slate-700">
          {message}
        </div>
        {reasonLabel ? (
          <div className="mt-3">
            <label htmlFor={reasonId} className="block text-xs font-semibold text-slate-700">
              {reasonLabel}
              {reasonRequired ? <span className="text-red-700"> (required)</span> : null}
            </label>
            <textarea
              id={reasonId}
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
            />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={!canConfirm}
            className={[
              "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60",
              tone === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-emerald-700 hover:bg-emerald-800",
            ].join(" ")}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
