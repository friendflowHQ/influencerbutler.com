"use client";

import { useCallback, useEffect, useState } from "react";

type Activity = {
  id: number;
  kind: "trial_click" | "purchase";
  firstName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  planLabel: string | null;
  source: string | null;
  isBot: boolean;
  hidden: boolean;
  createdAt: string;
};

type Config = { enabled: boolean; windowMinutes: number; maxCount: number };

type ConfigResponse = {
  admin?: { email: string };
  config?: Config;
  events?: Activity[];
  error?: string;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function locationText(e: Activity): string {
  const parts: string[] = [];
  if (e.city) parts.push(e.city);
  if (e.region && e.region !== e.city) parts.push(e.region);
  let s = parts.join(", ");
  if (!s && e.country) s = e.country;
  return s || "Unknown location";
}

function headline(e: Activity): string {
  const where = locationText(e);
  if (e.kind === "purchase") {
    return `${e.firstName || "Someone"} from ${where} subscribed`;
  }
  return `Someone from ${where} started a trial`;
}

export default function AdminActivityPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [events, setEvents] = useState<Activity[]>([]);
  const [hours, setHours] = useState<number>(24);
  const [maxCount, setMaxCount] = useState<number>(5);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/activity/config", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ConfigResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      if (json.config) {
        setConfig(json.config);
        setEnabled(json.config.enabled);
        setHours(Math.max(1, Math.round(json.config.windowMinutes / 60)));
        setMaxCount(json.config.maxCount);
      }
      setEvents(json.events ?? []);
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

  const saveConfig = async () => {
    setSaving(true);
    setSavedNote(null);
    try {
      const res = await fetch("/api/admin/activity/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, windowMinutes: hours * 60, maxCount }),
      });
      const json = (await res.json()) as ConfigResponse;
      if (!res.ok) {
        setSavedNote(json.error ?? `Failed (${res.status})`);
        return;
      }
      if (json.config) setConfig(json.config);
      setSavedNote("Saved.");
    } catch {
      setSavedNote("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const toggleHidden = async (e: Activity) => {
    setBusyId(e.id);
    try {
      const res = await fetch("/api/admin/activity/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, hidden: !e.hidden }),
      });
      if (res.ok) {
        setEvents((prev) =>
          prev.map((row) => (row.id === e.id ? { ...row, hidden: !row.hidden } : row)),
        );
      }
    } catch {
      // ignore - leave row as-is
    } finally {
      setBusyId(null);
    }
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
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recent-activity widget</h1>
      <p className="mt-1 text-sm text-slate-600">
        Controls the social-proof popup on the homepage. Showing real trial clicks and purchases
        only.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading...</p>
      ) : fetchError ? (
        <p className="mt-8 text-rose-600">{fetchError}</p>
      ) : (
        <>
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Settings</h2>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(ev) => setEnabled(ev.target.checked)}
                  className="h-4 w-4"
                />
                Show the widget
              </label>
              <label className="text-sm text-slate-700">
                <span className="block">Show activity from the last</span>
                <span className="mt-1 inline-flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={hours}
                    onChange={(ev) => setHours(Number(ev.target.value))}
                    className="w-24 rounded border border-slate-300 px-2 py-1.5"
                  />
                  hours
                </span>
              </label>
              <label className="text-sm text-slate-700">
                <span className="block">Max events shown</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxCount}
                  onChange={(ev) => setMaxCount(Number(ev.target.value))}
                  className="mt-1 w-24 rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
              {savedNote ? <span className="text-sm text-slate-500">{savedNote}</span> : null}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Recent events
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Hidden events never appear in the public widget. Bot clicks are excluded automatically.
            </p>
            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {events.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No activity captured yet.</p>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${
                            e.kind === "purchase"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-orange-200 bg-orange-50 text-orange-700"
                          }`}
                        >
                          {e.kind === "purchase" ? "Purchase" : "Trial click"}
                        </span>
                        {e.hidden ? (
                          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            Hidden
                          </span>
                        ) : null}
                        {e.isBot ? (
                          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Bot
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-800">{headline(e)}</p>
                      <p className="text-xs text-slate-400">
                        {formatDate(e.createdAt)}
                        {e.planLabel ? ` · ${e.planLabel}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleHidden(e)}
                      disabled={busyId === e.id}
                      className="flex-none rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {busyId === e.id ? "..." : e.hidden ? "Unhide" : "Hide"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
