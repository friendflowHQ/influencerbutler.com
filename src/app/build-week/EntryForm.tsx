"use client";

import { useState } from "react";
import TurnstileField, { TURNSTILE_SITE_KEY } from "@/components/TurnstileField";
import { trackEvent } from "@/lib/analytics-client";
import type { BuildWeekCopy } from "./_copy";

/**
 * Eligibility / claim form for Build Week. Posts to /api/build-week/enter.
 * Ideas themselves are pitched in the Facebook group; this only records who is
 * behind them. Accessibility: every field has a visible label, errors use
 * role="alert", the consent box is required, and the "website" field is a
 * honeypot (hidden from people, filled by bots, silently dropped by the route).
 * The Turnstile widget loads only once the visitor engages with the form.
 */

type Status = "idle" | "loading" | "done" | "error";

const INPUT =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-200";

export default function EntryForm({
  copy,
  locale,
  rulesHref,
  privacyHref,
}: {
  copy: BuildWeekCopy["form"];
  locale: string;
  rulesHref: string;
  privacyHref: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [ideaUrl, setIdeaUrl] = useState("");
  const [ideaSummary, setIdeaSummary] = useState("");
  const [agree, setAgree] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [website, setWebsite] = useState("");
  const [engaged, setEngaged] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    if (TURNSTILE_SITE_KEY && !token) {
      setStatus("error");
      setMessage(copy.verify);
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/build-week/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          groupName,
          ideaUrl,
          ideaSummary,
          agree,
          updates,
          website,
          locale,
          turnstileToken: token ?? "",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? copy.errorGeneric);
        setResetSignal((n) => n + 1);
        return;
      }
      trackEvent("build_week_form_submit", { lang: locale });
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage(copy.errorNetwork);
      setResetSignal((n) => n + 1);
    }
  };

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-950" role="status">
        <p className="text-lg font-semibold">{copy.successTitle}</p>
        <p className="mt-2 text-sm">{copy.successBody}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      onFocusCapture={() => setEngaged(true)}
      className="relative space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bw-name" className="mb-1 block text-sm font-medium text-slate-900">
            {copy.name}
          </label>
          <input id="bw-name" name="name" type="text" required autoComplete="name" maxLength={120}
            value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="bw-email" className="mb-1 block text-sm font-medium text-slate-900">
            {copy.email}
          </label>
          <input id="bw-email" name="email" type="email" required autoComplete="email" maxLength={254}
            value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </div>
      </div>

      <div>
        <label htmlFor="bw-group" className="mb-1 block text-sm font-medium text-slate-900">
          {copy.groupName}
        </label>
        <input id="bw-group" name="groupName" type="text" maxLength={120}
          value={groupName} onChange={(e) => setGroupName(e.target.value)} className={INPUT} />
      </div>

      <div>
        <label htmlFor="bw-idea-url" className="mb-1 block text-sm font-medium text-slate-900">
          {copy.ideaUrl}
        </label>
        <input id="bw-idea-url" name="ideaUrl" type="url" inputMode="url" maxLength={500}
          aria-describedby="bw-idea-url-help" placeholder="https://www.facebook.com/groups/..."
          value={ideaUrl} onChange={(e) => setIdeaUrl(e.target.value)} className={INPUT} />
        <p id="bw-idea-url-help" className="mt-1 text-xs text-slate-600">{copy.ideaUrlHelp}</p>
      </div>

      <div>
        <label htmlFor="bw-idea-summary" className="mb-1 block text-sm font-medium text-slate-900">
          {copy.ideaSummary}
        </label>
        <textarea id="bw-idea-summary" name="ideaSummary" rows={3} maxLength={1500}
          value={ideaSummary} onChange={(e) => setIdeaSummary(e.target.value)} className={INPUT} />
      </div>

      {/* Honeypot: hidden from people, filled by bots. Off-screen rather than display:none so naive bots still see it. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="bw-website">Website</label>
        <input id="bw-website" name="website" type="text" tabIndex={-1} autoComplete="off"
          value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div className="flex items-start gap-3">
        <input id="bw-agree" name="agree" type="checkbox" required checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-400 text-orange-700 focus:ring-orange-300" />
        <label htmlFor="bw-agree" className="text-sm text-slate-800">
          {copy.agreeStart}
          <a href={rulesHref} className="font-medium text-orange-800 underline" target="_blank" rel="noopener noreferrer">
            {copy.agreeRules}
          </a>
          {copy.agreeMiddle}
          <a href={privacyHref} className="font-medium text-orange-800 underline" target="_blank" rel="noopener noreferrer">
            {copy.agreePrivacy}
          </a>
          {copy.agreeEnd}
        </label>
      </div>

      <div className="flex items-start gap-3">
        <input id="bw-updates" name="updates" type="checkbox" checked={updates}
          onChange={(e) => setUpdates(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-400 text-orange-700 focus:ring-orange-300" />
        <label htmlFor="bw-updates" className="text-sm text-slate-800">{copy.updates}</label>
      </div>

      {engaged ? <TurnstileField onToken={setToken} resetSignal={resetSignal} /> : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-xl bg-[#c2410c] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#9a3412] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
      >
        {status === "loading" ? copy.sending : copy.submit}
      </button>

      {status === "error" && message ? (
        <p role="alert" className="text-sm text-rose-700">{message}</p>
      ) : null}
    </form>
  );
}
