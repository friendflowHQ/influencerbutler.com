"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ALLOWED_NEXT_PREFIXES = [
  "/dashboard",
  "/affiliates/portal",
  "/help/community",
];

function resolveNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  const ok = ALLOWED_NEXT_PREFIXES.some(
    (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`),
  );
  return ok ? raw : "/dashboard";
}

type LinkMode = "signin" | "reset";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkMode, setLinkMode] = useState<LinkMode | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const searchParams = useSearchParams();

  // Magic links (sign-in links, comp welcomes, admin resends) land here:
  // Supabase's verify redirect carries the session tokens in the URL fragment,
  // and the middleware bounces logged-out visitors to /login with the fragment
  // intact. Consume the tokens, set the session, then bounce through the auth
  // callback so the middleware sees fresh cookies and referral stamping runs.
  useEffect(() => {
    const rawHash = window.location.hash;
    const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
    if (!hash) return;
    const params = new URLSearchParams(hash);

    const expiredMessage =
      "That sign-in link is invalid or has already been used. Request a fresh one below.";
    if (params.get("error") || params.get("error_description")) {
      setError(expiredMessage);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    setCompleting(true);
    const supabase = createClient();
    const next = resolveNext(searchParams.get("next"));
    let done = false;
    const finish = () => {
      done = true;
      // Hard redirect so the middleware sees the fresh session cookies; the
      // callback route also stamps first-touch referrals for new accounts.
      window.location.href = `/api/auth/callback?next=${encodeURIComponent(next)}`;
    };

    // Backup path: the browser client may auto-detect the fragment session
    // slightly after mount.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !done) finish();
    });

    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error: sessionError }) => {
        if (done) return;
        if (sessionError || !data.session) {
          setCompleting(false);
          setError(expiredMessage);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          return;
        }
        finish();
      });

    return () => sub.subscription.unsubscribe();
  }, [searchParams]);

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

  // Emails a one-time sign-in link (mode "signin") or a password-reset link
  // (mode "reset"). The endpoint always reports success, so accounts created
  // without a password (trial/comp checkouts) can still get in from here.
  const requestLink = async (mode: LinkMode) => {
    setError(null);
    setLinkNotice(null);
    if (!email) {
      setError("Enter your email above first, then choose an option.");
      return;
    }
    setLinkMode(mode);
    try {
      const res = await fetch("/api/auth/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mode }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setLinkNotice(
        mode === "reset"
          ? "We just sent a link to set your password. Check your inbox."
          : "We just sent a sign-in link to that address. Check your inbox. The link logs you straight in, and you can set a password afterwards under Profile.",
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLinkMode(null);
    }
  };

  if (completing) {
    return (
      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-700">Signing you in...</p>
        <p className="mt-1 text-xs text-slate-500">One moment while we finish setting up your session.</p>
      </div>
    );
  }

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
      {linkNotice ? <p className="text-sm text-green-700">{linkNotice}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#f97316] px-4 py-2.5 text-white font-medium hover:bg-[#ea580c] transition disabled:opacity-60"
      >
        {loading ? "Logging in..." : "Log in"}
      </button>

      {/* Both options carry equal weight on purpose. Plenty of accounts are
          created by checkout with no password ever set, so "Forgot your
          password?" reads as not-for-me to the people who most need it, and
          they end up looping on sign-in links instead. */}
      <div className="pt-2 text-sm text-slate-600">
        <p className="font-medium text-slate-700">No password yet, or trouble signing in?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => requestLink("reset")}
            disabled={linkMode !== null}
            className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
          >
            {linkMode === "reset" ? "Sending..." : "Set or reset my password"}
          </button>
          <button
            type="button"
            onClick={() => requestLink("signin")}
            disabled={linkMode !== null}
            className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
          >
            {linkMode === "signin" ? "Sending..." : "Email me a sign-in link"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Entered your email in the desktop app but never logged in on the website? You may not
          have an account here yet: use &quot;Email me a sign-in link&quot; and we&apos;ll set one
          up for you.
        </p>
      </div>
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
            <p className="text-xs text-slate-500">Welcome back to your command center</p>
          </div>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-600">Log in to manage your account.</p>

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
