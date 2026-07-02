"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DownloadButtons from "@/components/welcome/DownloadButtons";

/**
 * Onboarding checklist for the dashboard Overview. Auto steps come from
 * /api/dashboard/getting-started; the manual bits (download clicked,
 * checklist dismissed) persist server-side when the profiles.onboarding
 * column exists, and in localStorage until the migration lands.
 * Renders nothing while loading, when dismissed, or once every step is done.
 */

type Steps = {
  subscribe: boolean;
  download: boolean;
  activate: boolean;
  profile: boolean;
  review: boolean;
};

type ChecklistResponse = {
  show?: boolean;
  steps?: Steps;
  dismissed?: boolean;
  persisted?: boolean;
};

const LOCAL_KEY = "ib_onboarding_v1";

type LocalState = { downloaded_at?: string; dismissed_at?: string };

function readLocal(): LocalState {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as LocalState) : {};
  } catch {
    return {};
  }
}

function writeLocal(patch: LocalState) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), ...patch }));
  } catch {
    // private mode etc.: state just won't stick locally
  }
}

export default function GettingStartedChecklist() {
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState<Steps | null>(null);
  const [showDownloadButtons, setShowDownloadButtons] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/getting-started", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as ChecklistResponse;
        if (!alive || !json.show || !json.steps) return;

        const local = readLocal();
        const dismissed = json.dismissed || Boolean(local.dismissed_at);
        const merged: Steps = {
          ...json.steps,
          download: json.steps.download || Boolean(local.downloaded_at),
        };
        const allDone = Object.values(merged).every(Boolean);
        if (dismissed || allDone) return;
        setSteps(merged);
        setVisible(true);
      } catch {
        // best-effort: overview works without the checklist
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const post = useCallback(async (body: Record<string, string>) => {
    try {
      await fetch("/api/dashboard/getting-started", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // localStorage already has it
    }
  }, []);

  const markDownloaded = () => {
    writeLocal({ downloaded_at: new Date().toISOString() });
    setSteps((s) => (s ? { ...s, download: true } : s));
    void post({ action: "complete", step: "download" });
  };

  const dismiss = () => {
    writeLocal({ dismissed_at: new Date().toISOString() });
    setVisible(false);
    void post({ action: "dismiss" });
  };

  if (!visible || !steps) return null;

  const items: { key: keyof Steps; label: string; cta?: React.ReactNode }[] = [
    {
      key: "subscribe",
      label: "Start your subscription or free trial",
      cta: (
        <Link
          href="/dashboard/subscription"
          className="text-sm font-semibold text-orange-600 hover:underline"
        >
          Choose a plan
        </Link>
      ),
    },
    {
      key: "download",
      label: "Download the desktop app",
      cta: showDownloadButtons ? (
        <div onClickCapture={markDownloaded}>
          <DownloadButtons source="getting-started" size="md" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDownloadButtons(true)}
          className="text-sm font-semibold text-orange-600 hover:underline"
        >
          Show download links
        </button>
      ),
    },
    {
      key: "activate",
      label: "Activate your license in the app",
      cta: (
        <span className="text-xs text-slate-500">
          Open the app and paste the license key from this page.
        </span>
      ),
    },
    {
      key: "profile",
      label: "Complete your profile",
      cta: (
        <Link
          href="/dashboard/profile"
          className="text-sm font-semibold text-orange-600 hover:underline"
        >
          Add a name or photo
        </Link>
      ),
    },
    {
      key: "review",
      label: "Tell us how it's going",
      cta: (
        <Link
          href="/dashboard/feedback"
          className="text-sm font-semibold text-orange-600 hover:underline"
        >
          Leave a review
        </Link>
      ),
    },
  ];

  const doneCount = items.filter((i) => steps[i.key]).length;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Getting started</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {doneCount} of {items.length} done
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting-started checklist"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const done = steps[item.key];
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className={[
                  "flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold",
                  done ? "bg-emerald-100 text-emerald-700" : "border border-slate-300 text-transparent",
                ].join(" ")}
              >
                ✓
              </span>
              <span
                className={[
                  "text-sm",
                  done ? "text-slate-400 line-through" : "font-medium text-slate-800",
                ].join(" ")}
              >
                {item.label}
              </span>
              {!done && item.cta ? <span className="ml-auto">{item.cta}</span> : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
