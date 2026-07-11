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

type UpcomingItem = { at: string; city: string; region: string | null; country: string };

type ConfigResponse = {
  admin?: { email: string };
  config?: Config;
  events?: Activity[];
  seedEnabled?: boolean;
  seedUpcoming?: UpcomingItem[];
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
  return `Someone in ${where} is checking out Influencer Butler`;
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
  const [seedEnabled, setSeedEnabled] = useState<boolean>(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const [seedUpcoming, setSeedUpcoming] = useState<UpcomingItem[]>([]);

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
      setSeedEnabled(json.seedEnabled === true);
      setSeedUpcoming(json.seedUpcoming ?? []);
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

  const toggleSeed = async (next: boolean) => {
    setSeedBusy(true);
    setSeedNote(null);
    try {
      const res = await fetch("/api/admin/activity/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSeedNote(json.error ?? `Failed (${res.status})`);
        return;
      }
      setSeedEnabled(next);
      setSeedNote(next ? "Demo activity on." : "Demo activity off.");
      await load();
    } catch {
      setSeedNote("Network error.");
    } finally {
      setSeedBusy(false);
    }
  };

  const purgeSeeded = async () => {
    if (!window.confirm("Remove all seeded demo events? This cannot be undone.")) return;
    setSeedBusy(true);
    setSeedNote(null);
    try {
      const res = await fetch("/api/admin/activity/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSeedNote(json.error ?? `Failed (${res.status})`);
        return;
      }
      setSeedNote("Seeded events removed.");
      await load();
    } catch {
      setSeedNote("Network error.");
    } finally {
      setSeedBusy(false);
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

  // Genuine visitor / customer events only (seeded demo rows are tagged
  // source = "seed"). This is the activity real visitors see in the popup,
  // now that the widget loads on every page of the site, not just the homepage.
  const realEvents = events.filter((e) => e.source !== "seed");
  const liveRealCount = realEvents.filter((e) => !e.hidden && !e.isBot).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recent-activity widget</h1>
      <p className="mt-1 text-sm text-slate-600">
        Controls the social-proof popup that runs across the whole site (every page, whichever one a
        visitor lands on, except the logged-in dashboard). It shows real trial clicks and purchases,
        plus optional seeded demo activity during the launch period (see below). Turn the demo off
        once real signups are flowing.
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

          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Recent real activity
              </h2>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {liveRealCount} live now
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Genuine visitor trial clicks and customer purchases only (seeded demo events are
              excluded). This is what real visitors see in the social-proof popup, which now runs on
              every page of the site, not just the homepage. &quot;Live now&quot; counts the events
              currently eligible to appear (not hidden, not a bot, within the window above).
            </p>
            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {realEvents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">
                  No real activity captured yet. Trial-CTA clicks and purchases from across the site
                  will land here.
                </p>
              ) : (
                realEvents.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
                        {e.source ? ` · ${e.source}` : ""}
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

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Demo activity (launch period)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              While real traffic is still ramping up, this trickles soft &quot;someone is checking
              this out&quot; events into the feed (one every 10 to 70 minutes, from cities across the
              US plus a few other countries) so the popup is not empty. These are clearly tagged
              and never claim a verified purchase. Switch it off and remove them once real signups
              arrive.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={seedEnabled}
                  disabled={seedBusy}
                  onChange={(ev) => void toggleSeed(ev.target.checked)}
                  className="h-4 w-4"
                />
                Run demo activity
              </label>
              <button
                onClick={purgeSeeded}
                disabled={seedBusy}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                Remove all seeded events
              </button>
              {seedNote ? <span className="text-sm text-slate-500">{seedNote}</span> : null}
            </div>
          </section>

          {seedUpcoming.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Upcoming demo activity
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                The next {seedUpcoming.length} scheduled seeded events. Each fires automatically at
                the time shown (about one every 10 to 70 minutes, overnight US hours skipped), then
                drops into Recent events below. The queue refills itself.
              </p>
              <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {seedUpcoming.map((it, i) => {
                  const parts: string[] = [];
                  if (it.city) parts.push(it.city);
                  if (it.region && it.region !== it.city) parts.push(it.region);
                  let where = parts.join(", ");
                  if (!where && it.country) where = it.country;
                  return (
                    <div key={`${it.at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            Scheduled
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-800">
                          Someone in {where || "Unknown location"} is checking out Influencer Butler
                        </p>
                        <p className="text-xs text-slate-400">{formatDate(it.at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

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
                        {e.source === "seed" ? (
                          <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            Seeded
                          </span>
                        ) : null}
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
