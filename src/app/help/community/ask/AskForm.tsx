"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Tutorial = { id: string; title: string };

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function AskForm({ tutorials }: { tutorials: Tutorial[] }) {
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [workspaceId, setWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const reset = () => {
    setWorkspaceId("");
    setTitle("");
    setBody("");
    setState({ kind: "idle" });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !title.trim()) {
      setState({ kind: "error", message: "Pick a workspace and add a title." });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/help/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, title, body }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        const message =
          res.status === 401
            ? "Sign in required to post."
            : json.error || `Could not post (${res.status}).`;
        setState({ kind: "error", message });
        return;
      }
      setState({ kind: "success" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  if (state.kind === "success") {
    return (
      <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">
          Thanks — your question is in review
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
          We&apos;ll publish it on Community Q&amp;A once it&apos;s approved
          (usually within a day). You&apos;ll see it appear in the list below.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/help/community"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            View Community Q&amp;A →
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Ask another question
          </button>
        </div>
      </div>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6"
    >
      <label className="block text-sm font-medium text-slate-700">
        Workspace this is about
        <select
          name="workspaceId"
          required
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>
            Pick a workspace...
          </option>
          {tutorials.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Title
        <input
          type="text"
          name="title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="A short, specific question..."
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Details
        <textarea
          name="body"
          rows={6}
          maxLength={8000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What have you tried? What did you expect to see?"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {submitting ? "Posting..." : "Post question"}
        </button>
        {state.kind === "error" ? (
          <span className="text-sm text-red-600" aria-live="polite">
            {state.message}
          </span>
        ) : submitting ? (
          <span className="text-sm text-slate-500" aria-live="polite">
            Posting...
          </span>
        ) : null}
      </div>
    </form>
  );
}
