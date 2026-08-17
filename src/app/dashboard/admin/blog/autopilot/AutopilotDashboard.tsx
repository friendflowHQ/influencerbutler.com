"use client";

// Autopilot dashboard root: loads the queue, hosts the campaign wizard,
// one-off form, settings, and the queue table. Every mutation echoes the
// headSha loaded with the data; a 409 means another session changed the queue
// and the UI reloads.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CampaignWizard from "./CampaignWizard";
import OneOffForm from "./OneOffForm";
import QueueTable from "./QueueTable";
import SettingsPanel from "./SettingsPanel";
import type { AutopilotData, AutopilotItem } from "./autopilot-types";

export default function AutopilotDashboard() {
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState<AutopilotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [envMissing, setEnvMissing] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showOneOff, setShowOneOff] = useState(false);
  const [editing, setEditing] = useState<AutopilotItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blog/autopilot", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        if (String(json.error || "").includes("not configured")) setEnvMissing(true);
        setError(json.error || `Failed to load (${res.status})`);
        return;
      }
      setError(null);
      setData(json as AutopilotData);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const campaignsById = useMemo(
    () => new Map((data?.campaigns ?? []).map((c) => [c.id, c.theme.slice(0, 40)])),
    [data],
  );

  const patchItem = useCallback(
    async (itemId: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/blog/autopilot/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedHeadSha: data?.headSha }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Action failed (${res.status})`);
        if (res.status === 409) await refetch();
        return;
      }
      setError(null);
      await refetch();
    },
    [data, refetch],
  );

  const generateNow = useCallback(
    async (itemId: string) => {
      setNotice(null);
      try {
        const res = await fetch("/api/admin/blog/autopilot/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || `Generation failed (${res.status})`);
        } else {
          setError(null);
          setNotice(
            `Generated "${json.entry?.title ?? itemId}" - committed ${String(json.commitSha ?? "").slice(0, 7)}, deploying now.${
              json.warnings?.length ? ` Warnings: ${json.warnings.join("; ")}` : ""
            }`,
          );
        }
      } catch (err) {
        setError((err as Error).message);
      }
      await refetch();
    },
    [refetch],
  );

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  const queued = data?.items.filter((i) => i.status === "queued") ?? [];
  const visibleItems = (data?.items ?? [])
    .filter((i) => i.status !== "cancelled")
    .sort((a, b) => a.publishDate.localeCompare(b.publishDate));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Blog Autopilot</h1>
          <p className="mt-1 text-sm text-slate-600">
            AI-written posts, grounded in your tutorials and real screenshots, generated on
            schedule and committed like any other post.{" "}
            <Link href="/dashboard/admin/blog" className="text-[#f97316] hover:underline">
              Back to posts
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              setNotice(null);
              const res = await fetch("/api/admin/blog/autopilot/screenshots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              const json = await res.json();
              if (res.ok) {
                setNotice(
                  `Screenshot capture requested (${json.shots} shots). Fresh images land in the writer's index automatically once the desktop workflow commits them.`,
                );
              } else {
                setError(json.error || "Screenshot request failed");
              }
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="Dispatch the desktop-repo capture workflow (docs/autopilot-capture-spec.md)"
          >
            Request screenshots
          </button>
          <button
            type="button"
            onClick={() => setShowOneOff(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            One-off post
          </button>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
          >
            New campaign
          </button>
        </div>
      </div>

      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {envMissing ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The autopilot needs <code className="mx-1 rounded bg-amber-100 px-1">GITHUB_CONTENT_TOKEN</code>
          and <code className="mx-1 rounded bg-amber-100 px-1">GITHUB_CONTENT_REPO</code> in Vercel
          (shared with the blog manager), plus OPENAI_API_KEY.
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {!data && !error ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      ) : null}

      {data ? (
        <>
          {data.campaigns.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {data.campaigns.map((campaign) => {
                const items = data.items.filter((i) => i.campaignId === campaign.id);
                const done = items.filter((i) => i.status === "generated").length;
                return (
                  <div
                    key={campaign.id}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    title={campaign.theme}
                  >
                    <span className="font-medium text-slate-900">
                      {campaign.theme.slice(0, 48)}
                      {campaign.theme.length > 48 ? "..." : ""}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {done}/{items.length} generated
                    </span>
                    <span
                      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        campaign.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">
              Queue
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {queued.length} queued
              </span>
            </h2>
            <QueueTable
              items={visibleItems}
              campaignsById={campaignsById}
              onAction={(id, action) => patchItem(id, { action })}
              onReschedule={(id, publishDate) =>
                patchItem(id, { action: "reschedule", fields: { publishDate } })
              }
              onGenerateNow={generateNow}
              onEdit={setEditing}
            />
          </div>

          <div className="mt-6">
            <SettingsPanel data={data} onSaved={refetch} />
          </div>
        </>
      ) : null}

      {showWizard && data ? (
        <CampaignWizard
          data={data}
          onSaved={() => {
            setShowWizard(false);
            void refetch();
          }}
          onClose={() => setShowWizard(false)}
        />
      ) : null}
      {showOneOff && data ? (
        <OneOffForm
          data={data}
          onSaved={() => {
            setShowOneOff(false);
            void refetch();
          }}
          onClose={() => setShowOneOff(false)}
        />
      ) : null}
      {editing ? (
        <EditItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            await patchItem(editing.id, { action: "update", fields });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  onSave,
}: {
  item: AutopilotItem;
  onClose: () => void;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [keywords, setKeywords] = useState(item.keywords);
  const [summary, setSummary] = useState(item.summary);
  const [brief, setBrief] = useState(item.brief ?? "");
  const [busy, setBusy] = useState(false);

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#f97316] focus:outline-none";

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-6" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">Edit topic</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Title
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Keywords
            <input className={inputClass} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Summary draft
            <textarea className={`${inputClass} min-h-[60px]`} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Brief for the writer
            <textarea className={`${inputClass} min-h-[60px]`} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onSave({ title, keywords, summary, brief });
              }}
              className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
