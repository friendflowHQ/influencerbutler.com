"use client";

// One consistent banner for "something needs attention on this page": a setup
// step that has not run, a partial load, or an error. Says what is wrong, what
// it affects, and (optionally) gives a copyable fix, instead of a loose line of
// amber text.

import { useState } from "react";

export default function StatusBanner({
  tone = "warning",
  title,
  children,
  fix,
  fixLabel = "Copy",
}: {
  tone?: "warning" | "error" | "info";
  title: string;
  /** What it affects, in a sentence. */
  children?: React.ReactNode;
  /** A copyable command, file name or snippet. */
  fix?: string;
  fixLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const styles = {
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-rose-300 bg-rose-50 text-rose-900",
    info: "border-sky-300 bg-sky-50 text-sky-900",
  }[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mt-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-0.5">{children}</div> : null}
      {fix ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-white/70 px-2 py-1 text-xs">{fix}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(fix).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="rounded border border-current px-2 py-1 text-xs font-semibold hover:bg-white/60"
          >
            {copied ? "Copied" : fixLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
