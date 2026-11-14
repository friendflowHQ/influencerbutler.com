"use client";

/**
 * Client pieces of a private Storefront Score page:
 *   - ClaimPanel: the one-click claim (POST /api/invites/claim). Records the
 *     claim click first, then shows the FULL report the claim unlocks plus the
 *     steps to get into the app (download, open, or paste the key, which is also
 *     emailed by the comp issuer).
 *   - RemovePageButton: deletes the page and opts the creator out for good.
 *   - TimeBeacon: reports visible time on page with navigator.sendBeacon.
 */
import { useEffect, useRef, useState } from "react";

type Fix = { id: string; title: string; why: string; withButler: string; byHandNote?: string };

type ClaimResult = {
  ok: true;
  key: string | null;
  existingCustomer: boolean;
  email: string;
  openUrl: string;
  downloads: { windows: string; macAppleSilicon: string; macIntel: string };
  fixes: Fix[];
  campaignPosts?: { asin: string; title: string; campaign: { ratePct: number; brand?: string } | null }[];
};

/** Copies a ready-made caption (their own post link already inside). */
export function CopyCaptionButton({ caption }: { caption: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-orange-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
    >
      {copied ? "Caption copied" : "Copy caption"}
    </button>
  );
}

function beacon(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) navigator.sendBeacon("/api/invites/track", body);
    else void fetch("/api/invites/track", { method: "POST", body, keepalive: true });
  } catch {
    /* analytics never block the page */
  }
}

export function TimeBeacon({ code }: { code: string }) {
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    const start = () => {
      if (document.visibilityState === "visible") startedAt.current = Date.now();
    };
    const flush = () => {
      if (startedAt.current == null) return;
      const ms = Date.now() - startedAt.current;
      startedAt.current = null;
      if (ms > 500) beacon({ code, event: "time", ms });
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? flush() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [code]);
  return null;
}

export function RemovePageButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function remove() {
    if (!window.confirm("Remove this page for good? It is deleted right away and you will not get any more emails from us.")) return;
    setState("busy");
    try {
      const res = await fetch("/api/invites/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) window.location.reload();
    } catch {
      setState("error");
    }
  }
  if (state === "done") return <p role="status">Removed. You will not hear from us again.</p>;
  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={state === "busy"}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
      >
        {state === "busy" ? "Removing..." : "Remove my page"}
      </button>
      {state === "error" ? (
        <span role="alert" className="ml-2 text-sm text-slate-700">
          That did not work. Please try again, or reply to Liz&apos;s email and she will remove it.
        </span>
      ) : null}
    </>
  );
}

export default function ClaimPanel({ code, alreadyClaimed }: { code: string; alreadyClaimed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function claim() {
    setBusy(true);
    setError("");
    beacon({ code, event: "claim_click" });
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
          {busy ? "One moment..." : alreadyClaimed ? "Get my app links again" : "Claim my page and see the full report"}
        </button>
        {!alreadyClaimed ? (
          <p className="mt-2 text-sm text-slate-600">Free for 14 days, no card. You can remove the page anytime.</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-slate-800">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5" aria-live="polite">
      {!alreadyClaimed && result.fixes.length > 1 ? (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900">Your full report</h3>
          <ol className="mt-3 space-y-4">
            {result.fixes.slice(1).map((f, i) => (
              <li key={f.id} className="rounded-xl bg-white p-4">
                <div className="text-sm font-semibold text-orange-800">#{i + 2}</div>
                <h4 className="font-semibold text-slate-900">{f.title}</h4>
                <p className="mt-1 text-slate-700">{f.why}</p>
                <p className="mt-2 text-slate-700">
                  <span className="font-medium">With Influencer Butler:</span> {f.withButler}
                </p>
                {f.byHandNote ? <p className="mt-1 text-sm text-slate-600">By hand: {f.byHandNote}.</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {!alreadyClaimed && result.campaignPosts && result.campaignPosts.length > 0 ? (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900">Every open campaign on your posts</h3>
          <p className="mt-1 text-sm text-slate-600">For Gold and Platinum creators.</p>
          <ul className="mt-3 space-y-2">
            {result.campaignPosts.map((p) => (
              <li key={p.asin} className="rounded-xl bg-white px-4 py-2 text-slate-800">
                {p.title}: {p.campaign?.brand ? `${p.campaign.brand}, ` : ""}
                {p.campaign?.ratePct}% commission
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <h3 className="text-lg font-bold text-slate-900">Get started in two steps</h3>
      <ol className="mt-3 list-decimal space-y-4 pl-5 text-slate-700">
        <li>
          <span className="font-semibold">Download Influencer Butler</span> (skip this if you already have it):
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50" href={result.downloads.windows}>
              Windows
            </a>
            <a className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50" href={result.downloads.macAppleSilicon}>
              Mac (Apple chip)
            </a>
            <a className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50" href={result.downloads.macIntel}>
              Mac (Intel)
            </a>
          </div>
        </li>
        <li>
          <span className="font-semibold">Open your page in the app.</span> Once it is installed, click this and your
          page and report load in:
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
        <div className="mt-5 rounded-xl bg-white p-4">
          <p className="text-sm text-slate-700">
            If the app asks for a license key, paste this one (we also emailed it to {result.email}):
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-slate-50 px-2 py-1 text-sm">{result.key}</code>
            <button type="button" onClick={copyKey} className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">
              {copied ? "Copied" : "Copy key"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-700">
          You already have Influencer Butler, so your plan stays exactly as it is. Sign in with {result.email} and the
          button above loads your page.
        </p>
      )}
    </div>
  );
}
