"use client";

import { useState } from "react";

type Props = {
  questionId: string;
  initialUpvotes: number;
  initialUpvoted: boolean;
  signedIn: boolean;
};

export default function UpvoteButton({
  questionId,
  initialUpvotes,
  initialUpvoted,
  signedIn,
}: Props) {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (!signedIn) {
      const next = `/help/community/${questionId}`;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      return;
    }
    setError(null);
    setWorking(true);
    // Optimistic update.
    const prevUpvoted = upvoted;
    const prevUpvotes = upvotes;
    setUpvoted(!prevUpvoted);
    setUpvotes(prevUpvotes + (prevUpvoted ? -1 : 1));
    try {
      const res = await fetch(`/api/help/questions/${questionId}/upvote`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        upvoted?: boolean;
        upvotes?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setUpvoted(prevUpvoted);
        setUpvotes(prevUpvotes);
        setError(json.error || `Could not upvote (${res.status}).`);
        return;
      }
      setUpvoted(Boolean(json.upvoted));
      setUpvotes(typeof json.upvotes === "number" ? json.upvotes : prevUpvotes);
    } catch (err) {
      setUpvoted(prevUpvoted);
      setUpvotes(prevUpvotes);
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={working}
        aria-pressed={upvoted}
        className={[
          "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:opacity-60",
          upvoted
            ? "border-orange-600 bg-orange-50 text-orange-700"
            : "border-slate-300 bg-white text-slate-700 hover:border-orange-500 hover:bg-orange-50 hover:text-orange-700",
        ].join(" ")}
      >
        <span aria-hidden>▲</span>
        <span>{upvotes}</span>
        <span className="hidden sm:inline">{upvoted ? "Upvoted" : "Upvote"}</span>
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
