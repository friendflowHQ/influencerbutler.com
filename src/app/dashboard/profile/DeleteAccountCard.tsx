"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  pending: boolean;
  scheduledFor: string | null;
  blocker: "staff" | "subscription" | "check_failed" | null;
  graceDays: number;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * "Delete account" card for the Profile page. Deletion is scheduled a few days
 * out (grace period) and can be cancelled until then. See
 * src/lib/account-deletion.ts for exactly what is erased and what is kept.
 */
export default function DeleteAccountCard({ email }: { email: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/delete", { cache: "no-store" });
      if (!res.ok) throw new Error("status");
      setStatus((await res.json()) as Status);
      setLoadError(null);
    } catch {
      setLoadError("Could not load your deletion status. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase() && email.length > 0;

  async function schedule(event: React.FormEvent) {
    event.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: typed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not schedule deletion.");
        return;
      }
      setOpen(false);
      setTyped("");
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        setError("Could not cancel. Please try again.");
        return;
      }
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const graceDays = status?.graceDays ?? 7;

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 sm:p-8 shadow-sm" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="text-lg font-semibold text-red-900">
        Delete account
      </h2>

      {loadError ? (
        <p className="mt-2 text-sm text-red-900" role="alert">
          {loadError}
        </p>
      ) : null}

      {status?.pending && status.scheduledFor ? (
        <div className="mt-2">
          <p className="text-sm text-red-900">
            Your account is scheduled to be permanently deleted on{" "}
            <strong>{formatDate(status.scheduledFor)}</strong>. Until then nothing is removed and you can
            change your mind.
          </p>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="mt-4 inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "Cancelling…" : "Cancel deletion"}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-red-900/80">
            Permanently delete your account and the data tied to it. We wait {graceDays} days before
            deleting, and you can cancel any time in that window.
          </p>

          <div className="mt-4 grid gap-4 text-sm text-slate-800 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-900">What gets deleted</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Your login, profile, and avatar</li>
                <li>Synced extension and dashboard data, saved Creator API credentials, and API keys</li>
                <li>AI Assistant history, call bookings, recordings, and event registrations</li>
                <li>Your email-list entries, testimonials, and feedback</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900">What stays</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Payment and tax records we must keep by law (including affiliate payouts and tax forms, 7 years)</li>
                <li>Billing records held by Lemon Squeezy</li>
                <li>Community posts, but no longer linked to you</li>
                <li>A record that you unsubscribed, so we never email you again</li>
              </ul>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-800">
            Affiliates: any earnings not yet paid out are lost when your account is deleted. Email{" "}
            <a className="font-medium text-red-700 underline" href="mailto:privacy@influencerbutler.com">
              privacy@influencerbutler.com
            </a>{" "}
            first if you are owed a payout.
          </p>

          {status?.blocker === "subscription" ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              You have an active subscription. Cancel it on the{" "}
              <a className="font-medium underline" href="/dashboard/subscription">
                Subscription page
              </a>{" "}
              first, then come back here to delete your account.
            </p>
          ) : status?.blocker === "staff" ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              This account cannot be deleted from the dashboard. Email privacy@influencerbutler.com.
            </p>
          ) : !open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={!status}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              Delete my account…
            </button>
          ) : (
            <form className="mt-4" onSubmit={schedule}>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  To confirm, type your email address: <span className="font-semibold">{email}</span>
                </span>
                <input
                  type="email"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!matches || busy}
                  className="inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
                >
                  {busy ? "Scheduling…" : `Schedule deletion in ${graceDays} days`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setTyped("");
                    setError(null);
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Never mind
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
