"use client";

// Email 2FA gate for the Finance section: request a 6-digit code, enter it,
// and the server opens a ~12h verified window (state lives server-side in
// finance_stepup, so refreshing or switching devices re-checks it).

import { useState } from "react";

type Props = {
  onVerified: () => void;
};

export default function StepUpGate({ onVerified }: Props) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/stepup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const json = (await res.json()) as { ok?: boolean; sentTo?: string; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not send the code.");
        return;
      }
      setSentTo(json.sentTo ?? "your admin email");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/stepup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Verification failed.");
        return;
      }
      onVerified();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Finance is locked</h1>
      <p className="mt-2 text-sm text-slate-600">
        This section holds revenue, payouts, and tax data, so it needs a second check: a 6-digit
        code sent to your admin email. Access lasts 12 hours per verification.
      </p>

      {sentTo === null ? (
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Sending..." : "Email me a code"}
        </button>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-600">
            Code sent to <span className="font-medium text-slate-900">{sentTo}</span>. It expires in
            10 minutes.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length === 6) void verify();
            }}
            placeholder="123456"
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-center text-lg tracking-[0.4em] text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void verify()}
            disabled={busy || code.length !== 6}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Checking..." : "Unlock Finance"}
          </button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={busy}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
          >
            Send a new code
          </button>
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
