"use client";

import Link from "next/link";
import Script from "next/script";
import { FormEvent, useState } from "react";

type Topic = "question" | "bug" | "feature";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function ContactForm() {
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [topic, setTopic] = useState<Topic>("question");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");

  const reset = () => {
    setTopic("question");
    setTitle("");
    setDescription("");
    setEmail("");
    setState({ kind: "idle" });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setState({ kind: "error", message: "Add a short subject so we know what this is about." });
      return;
    }
    // When Turnstile is configured, read the token it injects into the form.
    let turnstileToken = "";
    if (TURNSTILE_SITE_KEY) {
      const form = event.currentTarget;
      turnstileToken = String(
        new FormData(form).get("cf-turnstile-response") || "",
      );
      if (!turnstileToken) {
        setState({ kind: "error", message: "Please complete the verification below." });
        return;
      }
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: topic,
          title,
          description,
          userEmail: email,
          turnstileToken,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setState({
          kind: "error",
          message: json.error || `Could not send your message (${res.status}).`,
        });
        return;
      }
      setState({ kind: "success" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error. Please try again.",
      });
    }
  };

  if (state.kind === "success") {
    return (
      <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">
          Thanks, your message is on its way
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
          The team reads every message. If you left an email, we&apos;ll reply
          there.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Back to home
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <>
      {TURNSTILE_SITE_KEY ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      ) : null}
      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6"
      >
        <label className="block text-sm font-medium text-slate-700">
          What can we help with?
          <select
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value as Topic)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="question">Question</option>
            <option value="bug">Something is not working</option>
            <option value="feature">Feature request</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Subject
          <input
            type="text"
            name="title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A short summary..."
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Message
          <textarea
            name="description"
            rows={6}
            maxLength={8000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tell us what is going on and what you expected..."
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Your email (so we can reply)
          <input
            type="email"
            name="email"
            maxLength={200}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        {TURNSTILE_SITE_KEY ? (
          <div
            className="cf-turnstile"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-theme="light"
          />
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Send message"}
          </button>
          {state.kind === "error" ? (
            <span className="text-sm text-red-600" aria-live="polite">
              {state.message}
            </span>
          ) : submitting ? (
            <span className="text-sm text-slate-500" aria-live="polite">
              Sending...
            </span>
          ) : null}
        </div>
      </form>
    </>
  );
}
