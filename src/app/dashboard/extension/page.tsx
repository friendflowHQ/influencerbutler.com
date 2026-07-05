"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ScanRow = {
  asin: string;
  marketplace: string;
  title: string | null;
  price_cents: number | null;
  currency: string;
  brand_video_count: number;
  influencer_video_count: number;
  customer_video_count: number;
  approved: boolean;
  scanned_at: string;
};

type GapRow = {
  asin: string;
  marketplace: string;
  title: string | null;
  gap_type: "no_influencer_video" | "low_influencer_video";
  influencer_video_count: number;
  detected_at: string;
};

type IssueRow = {
  storefront_url: string | null;
  issue_type: string;
  severity: "info" | "warn" | "error";
  subject: string | null;
  detail: string | null;
  detected_at: string;
};

type Summary = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  scanCounts?: { total: number; approved: number };
  openGapCount?: number;
  issueCount?: number;
  recentScans?: ScanRow[];
  topGaps?: GapRow[];
  storefrontIssues?: IssueRow[];
  lastSyncAt?: string | null;
};

export default function ExtensionPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/extension/summary", { cache: "no-store" });
        const json = (await res.json()) as Summary;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.error ?? `Failed to load (${res.status})`);
          return;
        }
        setData(json);
      } catch (err) {
        console.error("extension dashboard load failed", err);
        if (!cancelled) setLoadError("Network error. Please refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (loadError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Chrome Extension</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          {loadError ?? "We couldn't load your extension data."}
        </div>
      </div>
    );
  }

  const hasData =
    !data.migrationPending &&
    ((data.scanCounts?.total ?? 0) > 0 ||
      (data.openGapCount ?? 0) > 0 ||
      (data.issueCount ?? 0) > 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Chrome Extension
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          What your butler saw on Amazon
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Product scans, content gaps, and storefront checkups sync here when the extension is
          connected with your license key.
          {data.lastSyncAt ? (
            <> Last synced {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.lastSyncAt))}.</>
          ) : null}
        </p>
      </header>

      {!hasData ? <EmptyState migrationPending={data.migrationPending === true} /> : null}

      {hasData ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Products scanned" value={data.scanCounts?.total ?? 0} />
            <StatTile label="Butler Approved spotted" value={data.scanCounts?.approved ?? 0} />
            <StatTile label="Open content gaps" value={data.openGapCount ?? 0} />
            <StatTile label="Storefront issues" value={data.issueCount ?? 0} />
          </div>

          <RecentScans scans={data.recentScans ?? []} />
          <ContentGaps gaps={data.topGaps ?? []} />
          <StorefrontIssues issues={data.storefrontIssues ?? []} />
        </>
      ) : null}
    </div>
  );
}

function EmptyState({ migrationPending }: { migrationPending: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Nothing synced yet</h2>
      <p className="mt-2 text-sm text-slate-600">
        {migrationPending
          ? "The extension data store is being set up. Check back shortly."
          : "Install the free Influencer Butler Chrome extension, connect it with your license key in the extension popup, and browse Amazon. Product scans, content gaps from your orders, and storefront checkups will show up here."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/extension"
          className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
        >
          Get the free extension
        </Link>
        <Link
          href="/help"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Read the tutorial
        </Link>
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

function RecentScans({ scans }: { scans: ScanRow[] }) {
  if (scans.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Recent scans</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4 font-semibold">Product</th>
              <th className="py-2 pr-4 font-semibold">Influencer</th>
              <th className="py-2 pr-4 font-semibold">Brand</th>
              <th className="py-2 pr-4 font-semibold">Customer</th>
              <th className="py-2 font-semibold">Seal</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={`${scan.asin}-${scan.marketplace}`} className="border-b border-slate-100">
                <td className="max-w-xs py-2 pr-4">
                  <a
                    href={`https://www.${scan.marketplace}/dp/${scan.asin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-1 font-medium text-slate-900 hover:text-[#f97316]"
                  >
                    {scan.title ?? scan.asin}
                  </a>
                </td>
                <td className="py-2 pr-4 font-semibold tabular-nums text-[#c2410c]">
                  {scan.influencer_video_count}
                </td>
                <td className="py-2 pr-4 tabular-nums text-slate-700">{scan.brand_video_count}</td>
                <td className="py-2 pr-4 tabular-nums text-slate-700">{scan.customer_video_count}</td>
                <td className="py-2">
                  {scan.approved ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                      Butler Approved
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContentGaps({ gaps }: { gaps: GapRow[] }) {
  if (gaps.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
        Content gaps: film what you already own
      </p>
      <ul className="mt-3 space-y-2">
        {gaps.map((gap) => (
          <li
            key={`${gap.asin}-${gap.marketplace}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
          >
            <a
              href={`https://www.${gap.marketplace}/dp/${gap.asin}`}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 max-w-md font-medium text-slate-900 hover:text-[#f97316]"
            >
              {gap.title ?? gap.asin}
            </a>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                gap.gap_type === "no_influencer_video"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {gap.gap_type === "no_influencer_video"
                ? "No influencer videos"
                : `Only ${gap.influencer_video_count} influencer video${gap.influencer_video_count === 1 ? "" : "s"}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StorefrontIssues({ issues }: { issues: IssueRow[] }) {
  if (issues.length === 0) return null;
  const badge = (severity: IssueRow["severity"]) =>
    severity === "error"
      ? "bg-red-100 text-red-800"
      : severity === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
        Storefront checkup
      </p>
      <ul className="mt-3 space-y-2">
        {issues.map((issue, index) => (
          <li key={index} className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="line-clamp-1 max-w-md font-medium text-slate-900">
                {issue.subject ?? "Video"}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(issue.severity)}`}
              >
                {issue.issue_type.replace(/_/g, " ")}
              </span>
            </div>
            {issue.detail ? <p className="mt-1 text-xs text-slate-600">{issue.detail}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
