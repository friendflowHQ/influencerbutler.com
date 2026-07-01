"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "pending" | "approved" | "rejected" | "hidden";

type Testimonial = {
  id: string;
  email: string | null;
  authorName: string | null;
  authorRole: string | null;
  planName: string | null;
  rating: number;
  body: string;
  photoUrl: string | null;
  avatarUrl: string | null;
  consent: boolean;
  status: Status;
  autoApproved: boolean;
  featured: boolean;
  teamResponse: string | null;
  respondedBy: string | null;
  source: string | null;
  createdAt: string;
};

type Config = {
  enabled: boolean;
  autoApprove: boolean;
  autoApproveMinRating: number;
  publicMaxCount: number;
};

type ListResponse = {
  admin?: { email: string };
  config?: Config;
  testimonials?: Testimonial[];
  error?: string;
};

const TABS: Array<{ key: Status | "all"; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "hidden", label: "Hidden" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} of 5 stars`} className="text-amber-500">
      {"★".repeat(n)}
      <span className="text-slate-300">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

export default function AdminTestimonialsPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tab, setTab] = useState<Status | "all">("pending");
  const [items, setItems] = useState<Testimonial[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Config panel state.
  const [enabled, setEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(true);
  const [minRating, setMinRating] = useState(4);
  const [maxCount, setMaxCount] = useState(12);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgNote, setCfgNote] = useState<string | null>(null);

  const load = useCallback(async (which: Status | "all") => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/admin/testimonials/list?status=${which}`, { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      if (json.config) {
        setEnabled(json.config.enabled);
        setAutoApprove(json.config.autoApprove);
        setMinRating(json.config.autoApproveMinRating);
        setMaxCount(json.config.publicMaxCount);
      }
      setItems(json.testimonials ?? []);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const mutate = async (payload: Record<string, unknown>, id: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/testimonials/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) await load(tab);
    } catch {
      // leave list as-is
    } finally {
      setBusyId(null);
    }
  };

  const saveConfig = async () => {
    setSavingCfg(true);
    setCfgNote(null);
    try {
      const res = await fetch("/api/admin/testimonials/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          autoApprove,
          autoApproveMinRating: minRating,
          publicMaxCount: maxCount,
        }),
      });
      const json = (await res.json()) as { error?: string };
      setCfgNote(res.ok ? "Saved." : json.error ?? `Failed (${res.status})`);
    } catch {
      setCfgNote("Network error.");
    } finally {
      setSavingCfg(false);
    }
  };

  const submitReply = async (id: string) => {
    await mutate({ action: "respond", id, response: replyText }, id);
    setReplyFor(null);
    setReplyText("");
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Testimonials</h1>
      <p className="mt-1 text-sm text-slate-600">
        Review customer reviews, reply as the team, and feature the best ones. Approved reviews show
        on the homepage within about a minute.
      </p>

      {/* Config */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Settings</h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            Show testimonials on the site
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="h-4 w-4" />
            Auto-approve high ratings
          </label>
          <label className="text-sm text-slate-700">
            <span className="block">Auto-approve at or above</span>
            <span className="mt-1 inline-flex items-center gap-2">
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                disabled={!autoApprove}
                className="rounded border border-slate-300 px-2 py-1.5 disabled:opacity-50"
              >
                {[3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="text-sm text-slate-700">
            <span className="block">Max shown on site</span>
            <input
              type="number"
              min={1}
              max={50}
              value={maxCount}
              onChange={(e) => setMaxCount(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={savingCfg}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {savingCfg ? "Saving..." : "Save settings"}
          </button>
          {cfgNote ? <span className="text-sm text-slate-500">{cfgNote}</span> : null}
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t.key
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">Nothing here yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {t.photoUrl || t.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photoUrl ?? t.avatarUrl ?? ""} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-500">
                      {t.authorName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-slate-900">{t.authorName ?? "Anonymous"}</strong>
                      <Stars n={t.rating} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {[t.authorRole, t.planName].filter(Boolean).join(" · ") || t.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-none flex-wrap items-center justify-end gap-1">
                  {t.featured ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Featured</span>
                  ) : null}
                  {t.autoApproved ? (
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Auto</span>
                  ) : null}
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 capitalize">
                    {t.status}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-700">&ldquo;{t.body}&rdquo;</p>
              <p className="mt-1 text-xs text-slate-400">
                {formatDate(t.createdAt)}
                {t.source ? ` · via ${t.source}` : ""}
                {t.consent ? "" : " · no display consent"}
              </p>

              {t.teamResponse ? (
                <div className="mt-3 rounded-lg border-l-2 border-orange-300 bg-orange-50/50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold text-orange-800">Influencer Butler team:</span>{" "}
                  {t.teamResponse}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {t.status !== "approved" ? (
                  <button
                    onClick={() => mutate({ action: "status", id: t.id, status: "approved" }, t.id)}
                    disabled={busyId === t.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Approve
                  </button>
                ) : (
                  <button
                    onClick={() => mutate({ action: "status", id: t.id, status: "hidden" }, t.id)}
                    disabled={busyId === t.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Hide
                  </button>
                )}
                {t.status !== "rejected" ? (
                  <button
                    onClick={() => mutate({ action: "status", id: t.id, status: "rejected" }, t.id)}
                    disabled={busyId === t.id}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    Reject
                  </button>
                ) : null}
                <button
                  onClick={() => mutate({ action: "feature", id: t.id, featured: !t.featured }, t.id)}
                  disabled={busyId === t.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {t.featured ? "Unfeature" : "Feature"}
                </button>
                <button
                  onClick={() => {
                    setReplyFor(replyFor === t.id ? null : t.id);
                    setReplyText(t.teamResponse ?? "");
                  }}
                  disabled={busyId === t.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {t.teamResponse ? "Edit reply" : "Reply"}
                </button>
              </div>

              {replyFor === t.id ? (
                <div className="mt-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="Reply as the Influencer Butler team..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => submitReply(t.id)}
                      disabled={busyId === t.id}
                      className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                    >
                      Save reply
                    </button>
                    {t.teamResponse ? (
                      <button
                        onClick={() => mutate({ action: "respond", id: t.id, response: null }, t.id)}
                        disabled={busyId === t.id}
                        className="text-sm text-slate-500 underline-offset-2 hover:underline"
                      >
                        Remove reply
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
