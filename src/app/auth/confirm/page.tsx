"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "ready" | "confirming" | "invalid";

function ConfirmSignIn() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const next = params.get("next") || "/dashboard";
  const [phase, setPhase] = useState<Phase>(tokenHash ? "ready" : "invalid");

  // The sign-in link lands here but we redeem nothing on load. Only this click
  // calls verifyOtp, so email scanners / link pre-fetchers that merely GET the
  // page never burn the single-use token before the human arrives.
  const handleConfirm = async () => {
    if (!tokenHash) {
      setPhase("invalid");
      return;
    }
    setPhase("confirming");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (error) {
      setPhase("invalid");
      return;
    }
    // Hard redirect so the middleware sees the fresh session cookies.
    window.location.href = next;
  };

  return (
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
          <p className="text-xs text-slate-500">Sign in</p>
        </div>
      </div>

      {phase === "invalid" ? (
        <div className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
          <p className="mt-2 text-sm text-slate-600">
            This sign-in link is invalid or has already been used. Head back to the login page
            and request a fresh one.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block font-medium text-[#f97316] hover:text-[#ea580c]"
          >
            Back to login
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Confirm sign in</h1>
          <p className="mt-2 text-sm text-slate-600">
            Click below to finish signing in to your Influencer Butler account.
          </p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={phase === "confirming"}
            className="mt-8 w-full rounded-lg bg-[#f97316] px-4 py-2.5 text-white font-medium hover:bg-[#ea580c] transition disabled:opacity-60"
          >
            {phase === "confirming" ? "Signing you in..." : "Confirm sign in"}
          </button>
        </>
      )}
    </section>
  );
}

export default function ConfirmSignInPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4 sm:p-6">
      <Suspense
        fallback={
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-8">
            <div className="space-y-4">
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </section>
        }
      >
        <ConfirmSignIn />
      </Suspense>
    </main>
  );
}
