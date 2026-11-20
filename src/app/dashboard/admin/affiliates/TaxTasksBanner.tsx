"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ReasonDialog from "./ReasonDialog";

/**
 * "Tasks" card shown above the admin affiliates tabs: tax forms waiting on
 * review, with Verify / Reject (the affiliate cannot be paid until verified).
 * Verify and Reject both open a confirm dialog; Reject requires a reason and
 * sits apart from Verify. The postal address is hidden until the admin clicks
 * Show (the pending read is already audited server-side). Self-contained:
 * fetches its own data and swallows its own errors, so an admin without the
 * affiliates.tax.view permission (403) simply sees no card and keeps the rest
 * of the page.
 */

export type PendingTaxForm = {
  userId: string;
  name: string | null;
  email: string | null;
  formType: string | null;
  legalName: string | null;
  country: string | null;
  address: string | null;
  tinLast4: string | null;
  tinKind: string | null;
  submittedAt: string | null;
  payableCents: number | null;
  owedCents: number | null;
};

type RowState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export type TaxReviewResult =
  | { ok: true; status: string; autoReleasedCents: number | null }
  | { ok: false; error: string };

/** POST the verify/reject to admin-tax-verify. Shared with the [userId] action bar. */
export async function reviewTaxForm(
  userId: string,
  action: "verify" | "reject",
  reason?: string,
): Promise<TaxReviewResult> {
  try {
    const res = await fetch("/api/affiliates/admin-tax-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, reason: reason ?? null }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: string;
      autoReleased?: { amountCents: number } | null;
      error?: string;
    };
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: data.error ?? `Request failed (${res.status})` };
    }
    return {
      ok: true,
      status: data.status ?? "",
      autoReleasedCents: data.autoReleased?.amountCents ?? null,
    };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export function verifyConfirmMessage(name: string): string {
  return (
    `Verify ${name}'s tax form?\n\n` +
    "If auto-pay is armed and they have a payable balance, this may immediately release their payout via PayPal."
  );
}

export function formatUsd(cents: number | null): string {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return "-";
  }
}

function displayName(p: PendingTaxForm): string {
  return p.name || p.legalName || p.email || p.userId;
}

/** The next payout run: the 1st of next month. */
function nextPayoutDateLabel(): string {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(first);
}

/** Collapsed address line: country only. The full address is behind a click. */
function maskedAddress(p: PendingTaxForm): string {
  return p.country ? `Address on file (${p.country})` : "Address on file";
}

type DialogState = { p: PendingTaxForm; action: "verify" | "reject" } | null;

export default function TaxTasksBanner({ onChanged }: { onChanged?: () => void }) {
  const [pending, setPending] = useState<PendingTaxForm[]>([]);
  const [row, setRow] = useState<Record<string, RowState>>({});
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogState>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliates/admin-tax-pending", { cache: "no-store" });
      if (!res.ok) return; // 403 (no tax permission) or transient error: show nothing.
      const data = (await res.json()) as { pending?: PendingTaxForm[] };
      setPending(Array.isArray(data.pending) ? data.pending : []);
    } catch {
      // Network error: leave the card hidden rather than breaking the page.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setRowState = (userId: string, state: RowState) =>
    setRow((prev) => ({ ...prev, [userId]: state }));

  const runReview = async (p: PendingTaxForm, action: "verify" | "reject", reason?: string) => {
    setDialog(null);
    setRowState(p.userId, { kind: "working" });
    const result = await reviewTaxForm(p.userId, action, reason);
    if (!result.ok) {
      setRowState(p.userId, { kind: "error", message: result.error });
      return;
    }
    const message =
      action === "verify"
        ? result.autoReleasedCents !== null
          ? `Verified. Auto-released ${formatUsd(result.autoReleasedCents)} via PayPal.`
          : "Verified."
        : "Rejected. The affiliate was dropped back to fix and resubmit.";
    setRowState(p.userId, { kind: "success", message });
    setTimeout(() => {
      void load();
      onChanged?.();
    }, 1500);
  };

  if (pending.length === 0) return null;

  const blockedCents = pending.reduce((sum, p) => sum + (p.payableCents ?? 0), 0);
  // Few tasks: show them all. A long queue starts collapsed to the header.
  const isOpen = expanded ?? pending.length <= 3;
  const listId = "tax-tasks-list";
  const dialogName = dialog ? displayName(dialog.p) : "";

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-amber-900">
          Tasks: tax forms pending review ({pending.length})
        </h2>
        {blockedCents > 0 ? (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
            Blocks {formatUsd(blockedCents)} payable on {nextPayoutDateLabel()}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={listId}
          className="ml-auto text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
        >
          {isOpen ? "Hide list" : "Show list"}
        </button>
      </div>
      <p className="mt-1 text-sm text-amber-800">
        These affiliates cannot be paid on the 1st until you verify their form.
      </p>
      {isOpen ? (
        <ul id={listId} className="mt-3 divide-y divide-amber-200">
          {pending.map((p) => {
            const state = row[p.userId] ?? { kind: "idle" };
            const showAddress = revealed[p.userId] === true;
            return (
              <li key={p.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                <div className="min-w-[180px]">
                  <span className="text-sm font-semibold text-slate-900">{displayName(p)}</span>
                  {p.email && p.name ? (
                    <span className="ml-2 text-xs text-slate-600">{p.email}</span>
                  ) : null}
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  {p.formType ?? "Tax form"}
                </span>
                <span className="text-xs text-slate-600">
                  Submitted {formatDateShort(p.submittedAt)}
                </span>
                <span className="text-xs text-slate-600">Payable {formatUsd(p.payableCents)}</span>
                {p.address ? (
                  <span className="text-xs text-slate-600">
                    {showAddress
                      ? `${p.address}${p.country ? `, ${p.country}` : ""}`
                      : maskedAddress(p)}{" "}
                    <button
                      type="button"
                      onClick={() => setRevealed((prev) => ({ ...prev, [p.userId]: !showAddress }))}
                      className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                    >
                      {showAddress ? "Hide" : "Show"}
                    </button>
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-red-700">
                    No address on file (needed for the 1099)
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {state.kind === "success" ? (
                    <span className="text-xs font-medium text-emerald-700">{state.message}</span>
                  ) : state.kind === "error" ? (
                    <span className="text-xs font-medium text-red-700">{state.message}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDialog({ p, action: "verify" })}
                    disabled={state.kind === "working"}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {state.kind === "working" ? "Working…" : "Verify"}
                  </button>
                  <Link
                    href={`/dashboard/admin/affiliates/${p.userId}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View
                  </Link>
                  <span className="ml-3 border-l border-amber-300 pl-3">
                    <button
                      type="button"
                      onClick={() => setDialog({ p, action: "reject" })}
                      disabled={state.kind === "working"}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ReasonDialog
        open={dialog !== null}
        title={
          dialog?.action === "verify"
            ? `Verify ${dialogName}'s tax form?`
            : `Reject ${dialogName}'s tax form?`
        }
        message={
          dialog?.action === "verify"
            ? "If auto-pay is armed and they have a payable balance, this may immediately release their payout via PayPal."
            : "They will be dropped back to fix and resubmit, and cannot be paid until a corrected form is verified."
        }
        confirmLabel={dialog?.action === "verify" ? "Verify" : "Reject form"}
        tone={dialog?.action === "verify" ? "primary" : "danger"}
        reasonLabel={dialog?.action === "reject" ? "Reason (shown to the affiliate)" : undefined}
        reasonRequired
        reasonDefault={dialog?.action === "reject" ? "Please review and resubmit." : ""}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => {
          if (dialog) {
            void runReview(dialog.p, dialog.action, dialog.action === "reject" ? reason : undefined);
          }
        }}
      />
    </div>
  );
}
