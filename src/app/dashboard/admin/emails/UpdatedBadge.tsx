"use client";

// "Updated Nov 8, 2026 by X" pill for built-in funnels, funnel steps and
// custom sequences. Fresh (30 days or less) is neutral slate; 31-60 days is
// amber-800 on amber-50; over 60 days is red-800 on red-50. Amber and red
// also say "Needs review" so the state never depends on color alone.

import {
  isStaleness,
  stalenessOf,
  updatedBadgeText,
  type Staleness,
} from "./funnel-admin-format";

const TONES: Record<Staleness, string> = {
  fresh: "bg-slate-100 text-slate-700",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  red: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200",
};

export default function UpdatedBadge({
  updatedAt,
  updatedBy,
  stale,
  showBy = true,
  variant = "pill",
  now,
}: {
  updatedAt: string | null | undefined;
  updatedBy?: string | null;
  /** Server-computed bucket; recomputed from updatedAt when absent or invalid. */
  stale?: Staleness | string | null;
  showBy?: boolean;
  /** "pill" for card headers, "inline" for small text beside step stats. */
  variant?: "pill" | "inline";
  now?: number;
}) {
  const bucket: Staleness = isStaleness(stale) ? stale : stalenessOf(updatedAt, now);
  const text = updatedBadgeText(updatedAt, updatedBy, bucket, { showBy });
  if (variant === "inline") {
    const tone =
      bucket === "fresh"
        ? "text-slate-500"
        : bucket === "amber"
          ? "rounded bg-amber-50 px-1 text-amber-800"
          : "rounded bg-red-50 px-1 text-red-800";
    return <span className={`whitespace-nowrap text-xs ${tone}`}>{text}</span>;
  }
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[bucket]}`}
    >
      {text}
    </span>
  );
}
