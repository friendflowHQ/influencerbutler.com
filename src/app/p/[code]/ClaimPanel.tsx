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
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

type Fix = { id: string; title: string; why: string; withButler: string; byHandNote?: string };

type ClaimResult = {
  ok: true;
  key: string | null;
  existingCustomer: boolean;
  email: string;
  openUrl: string;
  downloads: { windows: string; macAppleSilicon: string; macIntel: string };
  fixes: Fix[];
  campaignPosts?: { asin: string; title: string; campaign: { ratePct: number; brand?: string } | null; connectUrl?: string | null }[];
};

// The creator's Amazon Associates (offsite) tracking ID, typed once on this
// page and kept only in their own browser. With it, every copied caption links
// to the product with their tag; without it, the caption links to their post.
const TAG_STORAGE_KEY = "ib-invite-tracking-id";
const TAG_RE = /^[a-z0-9][a-z0-9-]{1,40}-2[0-9]$/i;

function readTrackingId(): string {
  try {
    const v = (window.localStorage.getItem(TAG_STORAGE_KEY) || "").trim();
    return TAG_RE.test(v) ? v : "";
  } catch {
    return "";
  }
}

/** Swap the caption's link for a /dp/ link carrying their own tag (bare ?tag= is right for /dp/). */
export function captionWithTag(caption: string, asin: string, tag: string): string {
  if (!tag || !/^[A-Z0-9]{10}$/i.test(asin)) return caption;
  const link = `https://www.amazon.com/dp/${asin.toUpperCase()}?tag=${tag}`;
  return caption.replace(/https:\/\/www\.amazon\.[a-z.]+\/\S+/i, link);
}

const TAG_EVENT = "ib-invite-tracking-id";

function subscribeTrackingId(cb: () => void) {
  window.addEventListener(TAG_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(TAG_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function TrackingIdBox() {
  // The saved ID (server render: none), kept in sync without setState-in-effect.
  const saved = useSyncExternalStore(subscribeTrackingId, readTrackingId, () => "");
  const valid = Boolean(saved);
  function save(v: string) {
    try {
      if (TAG_RE.test(v.trim())) window.localStorage.setItem(TAG_STORAGE_KEY, v.trim());
      else window.localStorage.removeItem(TAG_STORAGE_KEY);
    } catch {
      /* private mode: the caption simply keeps the post link */
    }
    window.dispatchEvent(new Event(TAG_EVENT));
  }
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="block text-sm font-medium text-slate-800" htmlFor="ib-invite-tracking-id">
        Your Amazon tracking ID for social posts (optional)
      </label>
      <input
        id="ib-invite-tracking-id"
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="yourname-20"
        // Uncontrolled; prefilled once on mount from this browser's saved ID.
        ref={(el) => {
          if (el && !el.value) el.value = readTrackingId();
        }}
        onChange={(e) => save(e.target.value)}
        className="mt-2 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
      />
      <p className="mt-2 text-sm text-slate-600">
        {valid
          ? "Your captions now link straight to each product with your tracking ID."
          : "Add the tracking ID you use outside Amazon (it ends in -20) and every caption links to the product with your ID, so sales from your socials are credited to you. It stays in this browser only."}
      </p>
    </div>
  );
}

/** Copies a ready-made caption: their own tracking ID link when they added one, else their post link. */
export function CopyCaptionButton({ caption, asin = "" }: { caption: string; asin?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(captionWithTag(caption, asin, readTrackingId()));
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

// The header's claim button (ClaimTopButton) asks the one ClaimPanel on the
// page to claim, so there is a single claim flow and a single result view.
const CLAIM_EVENT = "ib-invite-claim";

/** Small accessible info tooltip: a focusable "i" button; hover, focus or tap shows the text. */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = "ib-claim-tip";
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-orange-300 bg-white text-xs font-bold text-orange-800 hover:bg-orange-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-8 z-20 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm font-normal leading-snug text-slate-700 shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** The prominent claim box at the top right of an invite page. */
export function ClaimTopButton({ alreadyClaimed }: { alreadyClaimed: boolean }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm sm:w-72">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(CLAIM_EVENT))}
          className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-slate-950 shadow hover:bg-orange-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
        >
          {alreadyClaimed ? "Get my app links again" : "Claim my page, free"}
        </button>
        <InfoTip label="What claiming your page means">
          Claiming gives you this page already set up in Influencer Butler, every open campaign on your posts, and 14
          days of Influencer Butler Power User free, no card. Nothing goes live until you press Publish, and you can
          remove the page anytime.
        </InfoTip>
      </div>
      {!alreadyClaimed ? <p className="mt-2 text-xs text-slate-600">14 days free, no card. Remove anytime.</p> : null}
    </div>
  );
}

export default function ClaimPanel({ code, alreadyClaimed }: { code: string; alreadyClaimed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const claimRef = useRef<() => void>(() => undefined);

  // The header button: scroll here (where the result shows) and claim once.
  useEffect(() => {
    claimRef.current = () => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!busy && !result) void claim();
    };
  });
  useEffect(() => {
    const onClaim = () => claimRef.current();
    window.addEventListener(CLAIM_EVENT, onClaim);
    return () => window.removeEventListener(CLAIM_EVENT, onClaim);
  }, []);

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
      <div ref={rootRef} className="scroll-mt-6">
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
    <div ref={rootRef} className="scroll-mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5" aria-live="polite">
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
              <li key={p.asin} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2 text-slate-800">
                <span>
                  {p.title}: {p.campaign?.brand ? `${p.campaign.brand}, ` : ""}
                  {p.campaign?.ratePct}% commission
                </span>
                {p.connectUrl ? (
                  <a href={p.connectUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-orange-700 underline">
                    Open campaign
                  </a>
                ) : null}
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
