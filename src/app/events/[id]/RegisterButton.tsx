"use client";

import { useState } from "react";

type Props = {
  eventId: string;
  signedIn: boolean;
  label: string;
  returnPath: string;
};

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Registers directly from the public share page, matching what
 * /dashboard/events does internally - needed here because a private event
 * never appears in that generic list for a visitor to find and register from.
 */
export default function RegisterButton({ eventId, signedIn, label, returnPath }: Props) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (!signedIn) {
      window.location.href = `/login?next=${encodeURIComponent(returnPath)}`;
      return;
    }
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, timezone: browserTz() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not register.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p className="inline-flex items-center rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
        You&apos;re registered. Check your email for the invite.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "working"}
        className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c] disabled:opacity-60"
      >
        {state === "working" ? "Registering..." : label}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
