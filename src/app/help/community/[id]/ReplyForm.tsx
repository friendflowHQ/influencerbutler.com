"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type FormState =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

/**
 * Inline "Reply" control rendered under every answer (and reply). Posting
 * goes through the same answers endpoint with parentAnswerId set, which
 * nests the reply and emails the person being replied to.
 */
export default function ReplyForm({
  questionId,
  parentAnswerId,
  signedIn,
}: {
  questionId: string;
  parentAnswerId: string;
  signedIn: boolean;
}) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<FormState>({ kind: "closed" });

  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/help/community/${questionId}`)}`}
        className="text-xs font-semibold text-orange-600 hover:underline"
      >
        Reply
      </Link>
    );
  }

  if (state.kind === "closed") {
    return (
      <button
        type="button"
        onClick={() => setState({ kind: "open" })}
        className="text-xs font-semibold text-orange-600 hover:underline"
      >
        Reply
      </button>
    );
  }

  const submitting = state.kind === "submitting";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) {
      setState({ kind: "error", message: "Reply can't be empty." });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/help/questions/${questionId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parentAnswerId }),
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
              ? "Sign in required to reply."
              : json.error || `Could not post (${res.status}).`,
        });
        return;
      }
      // Hard reload so the new reply renders from the server component.
      window.location.reload();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2">
      <textarea
        name="body"
        rows={3}
        maxLength={8000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a reply..."
        autoFocus
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {submitting ? "Posting..." : "Post reply"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            setBody("");
            setState({ kind: "closed" });
          }}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
        {state.kind === "error" ? (
          <span className="text-xs text-red-600" aria-live="polite">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
