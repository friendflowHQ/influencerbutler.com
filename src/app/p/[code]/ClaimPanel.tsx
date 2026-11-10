"use client";

/**
 * The one-click claim on an invite preview: POST /api/invites/claim, then show
 * the three steps (download, open in the app, or paste the key). The key is
 * also emailed by the comp issuer, so closing this tab loses nothing.
 */
import { useState } from "react";

type ClaimResult = {
  ok: true;
  key: string | null;
  existingCustomer: boolean;
  email: string;
  openUrl: string;
  downloads: { windows: string; macAppleSilicon: string; macIntel: string };
};

export default function ClaimPanel({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invites/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) setError(json.error || "Something went wrong. Please try again.");
      else setResult(json as ClaimResult);
    } catch {
      setError("We could not reach the server. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!result?.key) return;
    try {
      await navigator.clipboard.writeText(result.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!result) {
    return (
      <div>
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="rounded-xl bg-orange-500 px-6 py-3 text-lg font-semibold text-slate-950 shadow hover:bg-orange-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 disabled:opacity-60"
        >
          {busy ? "Claiming..." : "Claim my page, free"}
        </button>
        {error ? (
          <p role="alert" className="mt-3 text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm" aria-live="polite">
      <h2 className="text-xl font-bold text-slate-900">It is yours. Two quick steps:</h2>
      <ol className="mt-4 list-decimal space-y-4 pl-5 text-slate-700">
        <li>
          <span className="font-semibold">Download Influencer Butler</span> (skip this if you already have it):
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50" href={result.downloads.windows}>
              Windows
            </a>
            <a className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50" href={result.downloads.macAppleSilicon}>
              Mac (Apple chip)
            </a>
            <a className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50" href={result.downloads.macIntel}>
              Mac (Intel)
            </a>
          </div>
        </li>
        <li>
          <span className="font-semibold">Open your page in the app.</span> Once it is installed, click this and your page
          loads in, ready to publish:
          <div className="mt-2">
            <a
              className="inline-block rounded-xl bg-orange-500 px-5 py-2 font-semibold text-slate-950 hover:bg-orange-600"
              href={result.openUrl}
            >
              Open my page in Influencer Butler
            </a>
          </div>
        </li>
      </ol>
      {result.key ? (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            If the app asks for a license key, paste this one (we also emailed it to {result.email}):
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-sm">{result.key}</code>
            <button type="button" onClick={copyKey} className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-white">
              {copied ? "Copied" : "Copy key"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-700">
          You already have Influencer Butler, so your plan stays exactly as it is. Sign in with {result.email} and the
          button above loads your new page.
        </p>
      )}
    </div>
  );
}
