"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type LicenseKey = {
  id: string;
  key: string;
  status: string;
  activation_limit: number | null;
  activations_count: number | null;
};

type Props = {
  variant: "card" | "panel";
};

const DOWNLOAD_URL = "https://dl.influencerbutler.com";

export default function LicenseKeyDisplay({ variant }: Props) {
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState<LicenseKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["active", "on_trial", "past_due", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(1);

        const sub = subs && subs.length > 0 ? (subs[0] as { id: string }) : null;
        if (!sub) {
          setLoading(false);
          return;
        }

        const { data: keys } = await supabase
          .from("license_keys")
          .select("id,key,status,activation_limit,activations_count")
          .eq("subscription_id", sub.id)
          .limit(1);

        if (keys && keys.length > 0) {
          setLicenseKey(keys[0] as LicenseKey);
        }
      } catch (err) {
        console.error("Failed to load license key", err);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const handleCopy = async () => {
    if (!licenseKey) return;
    try {
      await navigator.clipboard.writeText(licenseKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const maskedKey = licenseKey?.key
    ? `${licenseKey.key.slice(0, 8)}${"•".repeat(Math.max(0, licenseKey.key.length - 8))}`
    : null;

  // Compact card variant (for dashboard overview)
  if (variant === "card") {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            License Key
          </h2>
          {licenseKey && licenseKey.activation_limit !== null ? (
            <span className="text-xs text-slate-500">
              {licenseKey.activations_count ?? 0}/{licenseKey.activation_limit} activations
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-3 h-10 w-full animate-pulse rounded bg-slate-100" />
        ) : licenseKey ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 min-w-0 overflow-hidden truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900">
                {revealed ? licenseKey.key : maskedKey}
              </code>
              <button
                type="button"
                aria-label={revealed ? "Hide license key" : "Reveal license key"}
                title={revealed ? "Hide" : "Reveal"}
                onClick={() => setRevealed((prev) => !prev)}
                className="flex items-center justify-center rounded-lg border border-slate-300 px-2.5 py-2 text-slate-700 hover:bg-slate-50"
              >
                <EyeIcon open={revealed} />
              </button>
              <button
                type="button"
                aria-label="Copy license key"
                title={copied ? "Copied!" : "Copy"}
                onClick={handleCopy}
                className="flex items-center justify-center rounded-lg bg-[#f97316] px-2.5 py-2 text-white hover:bg-[#ea580c]"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            <a
              href={DOWNLOAD_URL}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <DownloadIcon />
              Download app
            </a>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            No license key yet.{" "}
            <Link href="/dashboard/subscription" className="text-[#f97316] hover:underline">
              Start your subscription
            </Link>{" "}
            to get one.
          </p>
        )}
      </article>
    );
  }

  // Large panel variant (for subscription page)
  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-10 w-full animate-pulse rounded bg-slate-100" />
      </section>
    );
  }

  if (!licenseKey) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">License key</h2>
      <p className="mt-1 text-sm text-slate-600">
        Use this key to activate the Influencer Butler desktop app.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="flex-1 min-w-0 break-all rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">
          {revealed ? licenseKey.key : maskedKey}
        </code>
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <EyeIcon open={revealed} />
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {licenseKey.activation_limit !== null ? (
        <p className="mt-3 text-xs text-slate-500">
          Activations: {licenseKey.activations_count ?? 0} of {licenseKey.activation_limit}
        </p>
      ) : null}
      <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Download the desktop app</h3>
        <p className="mt-1 text-sm text-slate-600">
          Install Influencer Butler on your computer, then paste your license key to activate.
        </p>
        <a
          href={DOWNLOAD_URL}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
        >
          <DownloadIcon />
          Download for Windows
        </a>
      </div>
    </section>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 8a11.05 11.05 0 01-4.06 5.19M6.1 6.1A11.05 11.05 0 001 12c1.73 4.89 6 8 11 8 1.73 0 3.37-.37 4.84-1.03"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"
      />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}
