"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DESKTOP_APP_DOWNLOAD_URL } from "@/lib/welcome-copy";

type LicenseStatus =
  | { status: "loading" }
  | { status: "no_token" | "expired" | "config_error" | "lookup_error" }
  | { status: "pending" }
  | {
      status: "ready";
      key: string;
      activationLimit: number | null;
    };

type ApiResponse =
  | { status: "no_token" | "pending" | "expired" | "config_error" | "lookup_error" }
  | {
      status: "ready";
      license_key: {
        key: string;
        status: string | null;
        activation_limit: number | null;
      };
      subscription?: { status: string | null; ls_variant_id: string | null };
    };

/**
 * Shown by the /welcome dispatcher to a guest-checkout buyer who has the
 * welcome_token cookie but no Supabase auth session yet. Lets them download
 * the desktop app immediately and surfaces their license key as soon as the
 * LS webhooks land — without waiting for them to click a magic-link email.
 *
 * The magic-link email still goes out in the background (handled by the LS
 * webhook) so they can sign in to the dashboard later; this page just stops
 * blocking the download/license-key reveal on it.
 *
 * Polls /api/welcome/license every 2s until status === "ready" or the token
 * is rejected. The download button is rendered immediately (it's just a link)
 * so they're never blocked from getting the installer.
 */
export default function WelcomeGuestClient({ intervalMs = 2000 }: { intervalMs?: number }) {
  const [state, setState] = useState<LicenseStatus>({ status: "loading" });
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/welcome/license", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;

        if (json.status === "ready") {
          setState({
            status: "ready",
            key: json.license_key.key,
            activationLimit: json.license_key.activation_limit,
          });
          return; // stop polling
        }

        // Terminal non-ready states: no point polling further.
        if (
          json.status === "no_token" ||
          json.status === "expired" ||
          json.status === "config_error" ||
          json.status === "lookup_error"
        ) {
          setState({ status: json.status });
          return;
        }

        // pending — keep polling.
        setState({ status: "pending" });
        timer = setTimeout(tick, intervalMs);
      } catch (err) {
        console.error("welcome license poll failed", err);
        if (cancelled) return;
        setState({ status: "pending" });
        timer = setTimeout(tick, intervalMs);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);

  const handleCopy = async () => {
    if (state.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — clipboard API can be blocked in some browsers/contexts
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-5 w-5 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Payment received
        </p>
      </div>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
        Welcome to Influencer Butler
      </h1>
      <p className="mt-3 text-sm text-slate-600 sm:text-base">
        You&apos;re all set. Download the desktop app and activate it with the license key
        below.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href={DESKTOP_APP_DOWNLOAD_URL}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
        >
          <DownloadIcon />
          Download the desktop app
        </a>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#f97316] hover:text-[#f97316]"
        >
          Go to dashboard
        </Link>
      </div>

      <div className="mt-10">
        <LicenseKeyPanel
          state={state}
          revealed={revealed}
          onToggleReveal={() => setRevealed((prev) => !prev)}
          copied={copied}
          onCopy={handleCopy}
        />
      </div>

      <aside className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-900">
          Save your license key somewhere safe
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Store it in your password manager (1Password, Bitwarden, etc.) or a notes app.
          You&apos;ll need it any time you reinstall the desktop app or activate it on a new
          computer.
        </p>
      </aside>

      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">What&apos;s next</h2>
        <ol className="mt-4 space-y-3">
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">1.</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Install the app</p>
              <p className="mt-1 text-sm text-slate-600">
                Run the installer you just downloaded.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">2.</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Paste your license key</p>
              <p className="mt-1 text-sm text-slate-600">
                On first launch, paste the key above into the activation field.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <span className="mt-0.5 font-semibold text-[#f97316]">3.</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Check your email for a sign-in link
              </p>
              <p className="mt-1 text-sm text-slate-600">
                We sent a sign-in link to the email you used at checkout — click it later
                whenever you want to manage billing or view your license from the
                dashboard.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Questions? Email{" "}
        <a
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-slate-700 hover:text-[#f97316]"
        >
          hello@influencerbutler.com
        </a>
        .
      </p>
    </section>
  );
}

function LicenseKeyPanel(props: {
  state: LicenseStatus;
  revealed: boolean;
  onToggleReveal: () => void;
  copied: boolean;
  onCopy: () => void;
}) {
  const { state, revealed, onToggleReveal, copied, onCopy } = props;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">Your license key</h2>
      <p className="mt-1 text-sm text-slate-600">
        Use this to activate the Influencer Butler desktop app.
      </p>

      <div className="mt-4">
        {state.status === "loading" || state.status === "pending" ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-slate-300" />
            <p className="text-sm text-slate-600">
              Generating your license key… this usually takes a few seconds.
            </p>
          </div>
        ) : state.status === "ready" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <code className="flex-1 min-w-0 break-all rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">
                {revealed
                  ? state.key
                  : `${state.key.slice(0, 8)}${"•".repeat(Math.max(0, state.key.length - 8))}`}
              </code>
              <button
                type="button"
                onClick={onToggleReveal}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <EyeIcon open={revealed} />
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-2 rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {state.activationLimit !== null ? (
              <p className="mt-3 text-xs text-slate-500">
                Activations included: {state.activationLimit}
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            We couldn&apos;t load your license key on this page. Check the email we sent
            you — it includes a sign-in link to view your key on the dashboard. If you
            still need help, email{" "}
            <a
              href="mailto:hello@influencerbutler.com"
              className="font-medium underline hover:text-amber-700"
            >
              hello@influencerbutler.com
            </a>
            .
          </div>
        )}
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
      />
    </svg>
  );
}
