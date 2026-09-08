"use client";

import { useState } from "react";

/**
 * Email capture for the Fluencer Fruit switch page. Posts to
 * /api/switch/subscribe, which records the contact with the
 * fluencer-fruit-switch tag and enrolls it in the switch drip. Same-origin
 * only: no external requests. The "website" field is a honeypot: real people
 * never see it, bots fill it in, and the route drops any submission carrying
 * a value.
 */
type Status = "idle" | "loading" | "done" | "error";

export default function SwitchEmailCapture() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/switch/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("done");
      setMessage("You are in. Your feature-by-feature map is on its way.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">{message}</p>
        <p className="mt-1 text-emerald-800">
          Five short emails over two weeks: the map, product research, campaigns, links and
          cross-posting, then a reminder before Fluencer Fruit closes. Unsubscribe any time with one click.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <label className="sr-only" htmlFor="switch-email">
        Email address
      </label>
      <input
        id="switch-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-orange-500"
      />
      {/* Honeypot: hidden from people, filled by bots. Keep off-screen rather than display:none so naive bots still see it. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="switch-website">Website</label>
        <input
          id="switch-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
      >
        {status === "loading" ? "Sending..." : "Send me the map"}
      </button>
      {status === "error" && message ? (
        <p role="alert" className="text-sm text-rose-600 sm:basis-full">
          {message}
        </p>
      ) : null}
    </form>
  );
}
