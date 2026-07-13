"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Phase = "checking" | "ready" | "invalid" | "saving" | "saved";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The recovery link lands here and Supabase establishes a session from the
  // URL (a ?code= exchange for the PKCE flow, or an auto-detected token hash).
  // We wait for that session before showing the form.
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const resolve = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setPhase(data.session ? "ready" : "invalid");
    };

    // Catch the case where the client processes the URL slightly after mount.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setPhase((p) => (p === "invalid" || p === "checking" ? "ready" : p));
    });

    void resolve();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setPhase("saving");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setPhase("ready");
      return;
    }
    setPhase("saved");
    // Hard redirect so the middleware sees the fresh session cookies.
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1200);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4 sm:p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/assets/influencer-butler-logo.png"
            alt="Influencer Butler logo"
            width={48}
            height={48}
            className="rounded-lg"
            priority
          />
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Influencer Butler</p>
            <p className="text-xs text-slate-500">Set a new password</p>
          </div>
        </div>

        {phase === "checking" ? (
          <div className="mt-8 space-y-4">
            <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : null}

        {phase === "invalid" ? (
          <div className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
            <p className="mt-2 text-sm text-slate-600">
              This reset link is invalid or has already been used. Head back to the login page
              and request a fresh one.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block font-medium text-[#f97316] hover:text-[#ea580c]"
            >
              Back to login
            </Link>
          </div>
        ) : null}

        {phase === "saved" ? (
          <div className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
            <p className="mt-2 text-sm text-slate-600">Taking you to your dashboard...</p>
          </div>
        ) : null}

        {phase === "ready" || phase === "saving" ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
            <p className="mt-2 text-sm text-slate-600">Enter a new password for your account.</p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                />
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={phase === "saving"}
                className="w-full rounded-lg bg-[#f97316] px-4 py-2.5 text-white font-medium hover:bg-[#ea580c] transition disabled:opacity-60"
              >
                {phase === "saving" ? "Saving..." : "Update password"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
