"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * "Tasks" card shown above the admin affiliates tabs: tax forms waiting on
 * review, with one-click Verify / Reject (the affiliate cannot be paid until
 * verified). Self-contained: fetches its own data and swallows its own errors,
 * so an admin without the affiliates.tax.view permission (403) simply sees no
 * card and keeps the rest of the page.
 */

export type PendingTaxForm = {
  userId: string;
  name: string | null;
  email: string | null;
  formType: string | null;
  legalName: string | null;
  country: string | null;
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

export default function TaxTasksBanner({ onChanged }: { onChanged?: () => void }) {
  const [pending, setPending] = useState<PendingTaxForm[]>([]);
  const [row, setRow] = useState<Record<string, RowState>>({});

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

  const onReview = async (p: PendingTaxForm, action: "verify" | "reject") => {
    const name = displayName(p);
    let reason: string | undefined;
    if (action === "verify") {
      if (!window.confirm(verifyConfirmMessage(name))) return;
    } else {
      const input = window.prompt(
        `Reject ${name}'s tax form? They will be asked to fix and resubmit.\n\nReason (shown to the affiliate):`,
        "Please review and resubmit.",
      );
      if (input === null) return;
      reason = input.trim() || undefined;
    }

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

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-amber-900">
          Tasks: tax forms pending review ({pending.length})
        </h2>
      </div>
      <p className="mt-1 text-sm text-amber-800">
        These affiliates cannot be paid on the 1st until you verify their form.
      </p>
      <ul className="mt-3 divide-y divide-amber-200">
        {pending.map((p) => {
          const state = row[p.userId] ?? { kind: "idle" };
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
              <div className="ml-auto flex items-center gap-2">
                {state.kind === "success" ? (
                  <span className="text-xs font-medium text-emerald-700">{state.message}</span>
                ) : state.kind === "error" ? (
                  <span className="text-xs font-medium text-red-700">{state.message}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onReview(p, "verify")}
                  disabled={state.kind === "working"}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {state.kind === "working" ? "Working…" : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => void onReview(p, "reject")}
                  disabled={state.kind === "working"}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  Reject
                </button>
                <Link
                  href={`/dashboard/admin/affiliates/${p.userId}`}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
