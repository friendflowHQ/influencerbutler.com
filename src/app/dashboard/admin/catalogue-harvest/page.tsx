"use client";

import { useCallback, useEffect, useState } from "react";

type HarvestRow = {
  kind: string;
  status: string;
  message: string | null;
  version: string | null;
  snapshot_at: string | null;
  campaign_count: number;
  duration_ms: number;
  reported_at: string;
} | null;

type StatusResponse = {
  ok: boolean;
  admin?: { email: string };
  cc?: HarvestRow;
  spcc?: HarvestRow;
  deals?: HarvestRow;
  error?: string;
};

const STALE_THRESHOLD_MS = 18 * 60 * 60 * 1000; // 18h matches desktop banner

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function CatalogueHarvestAdminPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [cc, setCc] = useState<HarvestRow>(null);
  const [spcc, setSpcc] = useState<HarvestRow>(null);
  const [deals, setDeals] = useState<HarvestRow>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [triggerState, setTriggerState] = useState<
    | { kind: "idle" }
    | { kind: "working"; selection: "cc" | "spcc" | "both" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/catalogue-harvest/status", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as StatusResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setAdminEmail(json.admin?.email ?? null);
      setCc(json.cc ?? null);
      setSpcc(json.spcc ?? null);
      setDeals(json.deals ?? null);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onTrigger = async (selection: "cc" | "spcc" | "both") => {
    if (
      !window.confirm(
        `Trigger a ${selection === "both" ? "CC + SPCC" : selection.toUpperCase()} harvest now? The workflow runs on GitHub Actions and takes 5 to 15 minutes.`,
      )
    ) {
      return;
    }
    setTriggerState({ kind: "working", selection });
    try {
      const res = await fetch("/api/admin/catalogue-harvest/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: selection }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; dispatchedAt?: string };
      if (!res.ok || !json.ok) {
        setTriggerState({
          kind: "error",
          message: json.error ?? `Failed (${res.status})`,
        });
        return;
      }
      setTriggerState({
        kind: "success",
        message: `Dispatched at ${formatDate(json.dispatchedAt ?? new Date().toISOString())}. The next heartbeat will appear here once the run completes.`,
      });
    } catch (err) {
      console.error(err);
      setTriggerState({ kind: "error", message: "Network error." });
    }
  };

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin only</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          Your account is not in the admin allowlist. If you should have access, add your email to
          the <code className="rounded bg-amber-100 px-1 py-0.5">ADMIN_EMAILS</code> environment
          variable.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Catalogue harvest</h1>
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Catalogue harvest</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {fetchError}
        </div>
      </div>
    );
  }

  function renderRow(label: string, row: HarvestRow) {
    if (!row) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="mt-2 text-sm text-slate-500">No heartbeat received yet.</p>
        </div>
      );
    }
    const ageMs = row.reported_at ? Date.now() - Date.parse(row.reported_at) : Number.NaN;
    const isStale = !Number.isFinite(ageMs) || ageMs > STALE_THRESHOLD_MS;
    const statusOk = row.status === "ok";
    return (
      <div
        className={`rounded-xl border bg-white p-5 shadow-sm ${
          statusOk && !isStale ? "border-emerald-200" : "border-amber-300"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
              statusOk
                ? isStale
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {statusOk ? (isStale ? "stale" : "fresh") : "error"}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
          <dt className="font-medium">Last heartbeat</dt>
          <dd>
            {formatDate(row.reported_at)}{" "}
            <span className="text-slate-500">({formatAge(ageMs)})</span>
          </dd>
          <dt className="font-medium">Version</dt>
          <dd>{row.version ?? "n/a"}</dd>
          <dt className="font-medium">{row.kind === "deals" ? "Deals" : "Campaigns"}</dt>
          <dd>{row.campaign_count.toLocaleString()}</dd>
          <dt className="font-medium">Run duration</dt>
          <dd>{row.duration_ms > 0 ? `${Math.round(row.duration_ms / 1000)}s` : "n/a"}</dd>
        </dl>
        {row.message ? (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-700">{row.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Catalogue harvest</h1>
        <p className="mt-1 text-sm text-slate-600">
          {adminEmail ? `Signed in as ${adminEmail}. ` : null}
          Tracks the CC, SPCC, and Deals catalogue snapshots that the InfluencerButler desktop app
          downloads from R2. The hourly harvest runner on the operator&apos;s machine reports a
          heartbeat per kind after each run, so &quot;fresh&quot; here means that run reported in.
          Deals (Amazon promo deals) are status-only: they refresh with the hourly runner and have no
          remote trigger button.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onTrigger("both")}
            disabled={triggerState.kind === "working"}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {triggerState.kind === "working" && triggerState.selection === "both"
              ? "Dispatching..."
              : "Run CC + SPCC now"}
          </button>
          <button
            type="button"
            onClick={() => void onTrigger("cc")}
            disabled={triggerState.kind === "working"}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            CC only
          </button>
          <button
            type="button"
            onClick={() => void onTrigger("spcc")}
            disabled={triggerState.kind === "working"}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            SPCC only
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            Refresh status
          </button>
        </div>
        {triggerState.kind === "success" ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {triggerState.message}
          </p>
        ) : null}
        {triggerState.kind === "error" ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {triggerState.message}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {renderRow("CC (Affiliate+ catalogue)", cc)}
        {renderRow("SPCC (Sponsored Products for Creators)", spcc)}
        {renderRow("Deals (Amazon promo deals)", deals)}
      </section>
    </div>
  );
}
