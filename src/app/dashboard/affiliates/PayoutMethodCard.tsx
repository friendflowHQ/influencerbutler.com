"use client";

import { useState } from "react";

/**
 * Affiliate PayPal payout destination. We pay commissions via PayPal; the
 * affiliate bears PayPal receiving / currency-conversion fees (stated in the
 * terms), so the amount that lands can be a little less than the gross.
 */

type Props = {
  initialEmail: string | null;
  onChange?: (email: string) => void;
};

export default function PayoutMethodCard({ initialEmail, onChange }: Props) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [saved, setSaved] = useState<string | null>(initialEmail);
  const [editing, setEditing] = useState(!initialEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/affiliates/payout-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypalEmail: email.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; paypalEmail?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not save. Please try again.");
        setSaving(false);
        return;
      }
      const savedEmail = json.paypalEmail ?? email.trim();
      setSaved(savedEmail);
      setEditing(false);
      onChange?.(savedEmail);
    } catch (err) {
      console.error("payout-method save failed", err);
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            saved ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          {saved ? "PayPal on file" : "Payout method required"}
        </span>
      </div>

      {!editing && saved ? (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Payouts go to <span className="font-mono text-slate-900">{saved}</span> via PayPal.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 text-sm font-medium text-[#f97316] underline underline-offset-2"
          >
            Change PayPal email
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Where should we send your commissions? Enter the email on your PayPal account.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            PayPal receiving and currency-conversion fees are not covered, so the amount you receive
            may be slightly less than your gross commission.
          </p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </>
      )}
    </section>
  );
}
