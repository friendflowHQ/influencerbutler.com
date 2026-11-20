"use client";

// Accessible confirm dialog for destructive or money-moving admin actions.
// Names the target and consequence in the message, so the admin sees exactly
// who and what before confirming. Esc or backdrop click cancels; focus starts
// on Cancel so Enter never confirms by accident.

import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <div id="confirm-dialog-body" className="mt-2 text-sm text-slate-700">
          {message}
        </div>
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
            onClick={onConfirm}
            disabled={busy}
            className={[
              "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60",
              tone === "danger" ? "bg-rose-700 hover:bg-rose-800" : "bg-indigo-700 hover:bg-indigo-800",
            ].join(" ")}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
