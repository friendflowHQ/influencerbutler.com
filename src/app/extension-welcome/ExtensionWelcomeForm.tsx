"use client";

import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ExtensionWelcomeForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/extension/review/optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, installedAt: Date.now() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Something went wrong.");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  };

  const card =
    "mx-auto mt-16 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8";

  if (state === "done") {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">You are all set</h1>
        <p className="mt-2 text-sm text-slate-600">
          Thanks! We will send you a couple of quick setup tips. In the meantime, head to any Amazon
          product page and you will see Influencer Butler light up with money signals.
        </p>
        <a
          href="https://www.amazon.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#ea580c]"
        >
          Try it on Amazon
        </a>
      </div>
    );
  }

  return (
    <div className={card}>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Welcome to Influencer Butler
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        The extension is installed and free to use. Drop your email and we will send a couple of
        setup tips to help you get the most out of it. No spam, unsubscribe anytime.
      </p>

      <div className="mt-5">
        <label htmlFor="welcome-email" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Your email
        </label>
        <input
          id="welcome-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-4">
        <a href="https://www.amazon.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-500 hover:text-slate-700">
          Skip for now
        </a>
        <button
          type="button"
          onClick={submit}
          disabled={state === "sending"}
          className="rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50"
        >
          {state === "sending" ? "Sending..." : "Send me setup tips"}
        </button>
      </div>
    </div>
  );
}
