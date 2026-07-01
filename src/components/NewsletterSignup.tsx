"use client";

import { useState } from "react";
import { FACEBOOK_GROUP_URL } from "@/lib/social";

/**
 * Newsletter opt-in form. Posts to /api/newsletter/subscribe. Used in the site
 * footer and at the end of blog posts as a low-commitment alternative to the
 * free-trial CTA ("not ready yet? get the free newsletter"). Plain Tailwind to
 * match the rest of the marketing chrome.
 */
type Props = {
  source: string;
  title?: string;
  subtitle?: string;
  className?: string;
};

type Status = "idle" | "loading" | "done" | "error";

export default function NewsletterSignup({ source, title, subtitle, className }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("done");
      setMessage("You're in. Check your inbox for the next issue.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className={className}>
      {title ? (
        <h3 className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
      ) : null}
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}

      {status === "done" ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-emerald-700">{message}</p>
          <p className="mt-1 text-sm text-slate-500">
            While you wait, {" "}
            <a
              href={FACEBOOK_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#1877F2] hover:text-[#0d6ad8]"
            >
              join our Facebook group
            </a>{" "}
            to swap tips with other creators.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`newsletter-email-${source}`}>
            Email address
          </label>
          <input
            id={`newsletter-email-${source}`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-[14px] border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-[14px] bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {status === "loading" ? "Joining..." : "Subscribe"}
          </button>
        </form>
      )}

      {status === "error" && message ? (
        <p className="mt-2 text-sm text-rose-600">{message}</p>
      ) : null}
    </div>
  );
}
