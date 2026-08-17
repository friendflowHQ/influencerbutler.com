"use client";

// The autopilot queue: every planned post with its dates, status, and row
// actions. Generate-now runs the full pipeline (1-3 minutes) with a spinner.

import { useState } from "react";
import Link from "next/link";
import { ITEM_BADGE, type AutopilotItem } from "./autopilot-types";

type Props = {
  items: AutopilotItem[];
  campaignsById: Map<string, string>;
  onAction: (
    itemId: string,
    action: "cancel" | "retry",
  ) => Promise<void>;
  onReschedule: (itemId: string, publishDate: string) => Promise<void>;
  onGenerateNow: (itemId: string) => Promise<void>;
  onEdit: (item: AutopilotItem) => void;
};

export default function QueueTable({
  items,
  campaignsById,
  onAction,
  onReschedule,
  onGenerateNow,
  onEdit,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  if (!items.length) {
    return (
      <p className="mt-6 text-center text-sm text-slate-500">
        Nothing queued yet. Create a campaign or add a one-off post above.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Topic</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Publishes</th>
            <th className="px-3 py-2">Generates</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const displayStatus = item.due && item.status === "queued" ? "due" : item.status;
            const isGenerating = generatingId === item.id;
            return (
              <tr key={item.id} className="border-t border-slate-100 align-top">
                <td className="max-w-xs px-3 py-2">
                  <div className="truncate font-medium text-slate-900" title={item.title}>
                    {item.status === "generated" ? (
                      <Link
                        href={`/dashboard/admin/blog/edit/${item.slug}`}
                        className="hover:text-[#f97316]"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </div>
                  <div className="truncate text-xs text-slate-400" title={item.slug}>
                    {item.slug}
                    {item.campaignId ? (
                      <span className="ml-2 rounded bg-indigo-50 px-1 py-0.5 text-indigo-500">
                        {campaignsById.get(item.campaignId) || item.campaignId}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">{item.category}</td>
                <td className="px-3 py-2">
                  {item.status === "queued" ? (
                    <input
                      type="date"
                      defaultValue={item.publishDate}
                      disabled={busyId === item.id}
                      onBlur={(e) => {
                        if (e.target.value && e.target.value !== item.publishDate) {
                          void run(item.id, () => onReschedule(item.id, e.target.value));
                        }
                      }}
                      className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                    />
                  ) : (
                    <span className="text-slate-600">{item.publishDate}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{item.generateOn}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${ITEM_BADGE[displayStatus] ?? ITEM_BADGE.queued}`}
                    title={item.lastError ?? undefined}
                  >
                    {isGenerating ? "generating..." : displayStatus}
                  </span>
                  {item.status === "failed" && item.lastError ? (
                    <div className="mt-1 max-w-[220px] truncate text-xs text-rose-500" title={item.lastError}>
                      {item.lastError} ({item.attempts}x)
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {item.status === "queued" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isGenerating || busyId === item.id}
                          onClick={() => {
                            setGeneratingId(item.id);
                            void onGenerateNow(item.id).finally(() => setGeneratingId(null));
                          }}
                          className="rounded-md px-2 py-1 text-xs text-[#f97316] hover:bg-orange-50 disabled:opacity-50"
                        >
                          {isGenerating ? "Generating (1-3 min)..." : "Generate now"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => {
                            if (confirm(`Cancel "${item.title}"?`)) {
                              void run(item.id, () => onAction(item.id, "cancel"));
                            }
                          }}
                          className="rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {item.status === "failed" ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void run(item.id, () => onAction(item.id, "retry"))}
                          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => {
                            setGeneratingId(item.id);
                            void onGenerateNow(item.id).finally(() => setGeneratingId(null));
                          }}
                          className="rounded-md px-2 py-1 text-xs text-[#f97316] hover:bg-orange-50 disabled:opacity-50"
                        >
                          {isGenerating ? "Generating..." : "Generate now"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void run(item.id, () => onAction(item.id, "cancel"))}
                          className="rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {item.status === "generated" ? (
                      <Link
                        href={`/dashboard/admin/blog/edit/${item.slug}`}
                        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      >
                        Open post
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
