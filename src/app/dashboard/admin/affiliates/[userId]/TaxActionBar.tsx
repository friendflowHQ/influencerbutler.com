"use client";

import { useEffect, useState } from "react";
import {
  reviewTaxForm,
  verifyConfirmMessage,
  formatUsd,
  type PendingTaxForm,
} from "../TaxTasksBanner";

/**
 * Admin-only Verify / Reject bar for the affiliate whose dashboard is being
 * previewed. Rendered OUTSIDE the shared SelfHostedAffiliateDashboard (which the
 * real affiliate also uses and must stay read-only). Hidden unless this
 * affiliate has a form waiting on review; swallows its own 403s so admins
 * without the tax permission see today's page unchanged.
 */
export default function TaxActionBar({ userId }: { userId: string }) {
  const [pending, setPending] = useState<PendingTaxForm | null>(null);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/affiliates/admin-tax-pending?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: PendingTaxForm[] };
        if (!cancelled) setPending(data.pending?.[0] ?? null);
      } catch {
        // Leave the bar hidden on any error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!pending) return null;

  const name = pending.name || pending.legalName || pending.email || userId;

  const onReview = async (action: "verify" | "reject") => {
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

    setState({ kind: "working" });
    const result = await reviewTaxForm(userId, action, reason);
    if (!result.ok) {
      setState({ kind: "error", message: result.error });
      return;
    }
    const message =
      action === "verify"
        ? result.autoReleasedCents !== null
          ? `Verified. Auto-released ${formatUsd(result.autoReleasedCents)} via PayPal. Refreshing…`
          : "Verified. Refreshing…"
        : "Rejected. Refreshing…";
    setState({ kind: "success", message });
    // The embedded dashboard fetches on mount, so a reload re-renders the tax
    // card with the new status.
    setTimeout(() => window.location.reload(), 1200);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div>
        <strong>Tax form pending review.</strong> {pending.formType ?? "Tax form"} from {name}
        {pending.payableCents !== null ? (
          <span> - payable {formatUsd(pending.payableCents)}</span>
        ) : null}
        . They cannot be paid until you verify it.
      </div>
      <div className="ml-auto flex items-center gap-2">
        {state.kind === "success" ? (
          <span className="text-xs font-medium text-emerald-700">{state.message}</span>
        ) : state.kind === "error" ? (
          <span className="text-xs font-medium text-red-700">{state.message}</span>
        ) : null}
        <button
          type="button"
          onClick={() => void onReview("verify")}
          disabled={state.kind !== "idle" && state.kind !== "error"}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {state.kind === "working" ? "Working…" : "Verify"}
        </button>
        <button
          type="button"
          onClick={() => void onReview("reject")}
          disabled={state.kind !== "idle" && state.kind !== "error"}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
