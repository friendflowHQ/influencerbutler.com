"use client";

import { FormEvent, useState } from "react";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

export default function AnswerForm({ questionId }: { questionId: string }) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) {
      setState({ kind: "error", message: "Answer can't be empty." });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/help/questions/${questionId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setState({
          kind: "error",
          message:
            res.status === 401
              ? "Sign in required to answer."
              : json.error || `Could not post (${res.status}).`,
        });
        return;
      }
      // Hard reload so the new answer renders from the server component.
      window.location.reload();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  const submitting = state.kind === "submitting";

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-5"
    >
      <label className="block text-sm font-medium text-slate-700">
        Your answer
        <textarea
          name="body"
          rows={5}
          maxLength={8000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Share what worked for you, or where to look in the docs..."
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {submitting ? "Posting..." : "Post answer"}
        </button>
        {state.kind === "error" ? (
          <span className="text-sm text-red-600" aria-live="polite">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
