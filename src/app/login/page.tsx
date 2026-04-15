"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ALLOWED_NEXT_PREFIXES = ["/dashboard", "/affiliates/portal"];

function resolveNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  const ok = ALLOWED_NEXT_PREFIXES.some(
    (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`),
  );
  return ok ? raw : "/dashboard";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // Hard redirect so the middleware sees the fresh session cookies.
    const next = resolveNext(searchParams.get("next"));
    window.location.href = next;
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#f97316] px-4 py-2.5 text-white font-medium hover:bg-[#ea580c] transition disabled:opacity-60"
      >
        {loading ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}

function LoginFormFallback() {
  return (
    <div className="mt-8 space-y-4">
      <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-8">
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
            <p className="text-xs text-slate-500">Welcome back to your command center</p>
          </div>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-600">Log in to manage your campaigns.</p>

        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-sm text-slate-600">
          New to Influencer Butler?{" "}
          <Link href="/signup" className="font-medium text-[#f97316] hover:text-[#ea580c]">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
