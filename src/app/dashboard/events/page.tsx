"use client";

import { useCallback, useEffect, useState } from "react";

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  joinUrl: string | null;
  registered: boolean;
};

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatWhen(startsAt: string, endsAt: string, tz: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime())) return "";
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: tz,
  });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} to ${timeFmt.format(end)}`;
}

export default function UpcomingEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = browserTz();

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/events/list", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load events.");
        return;
      }
      const data = (await res.json()) as { events?: EventItem[] };
      setEvents(data.events ?? []);
      setError(null);
    } catch {
      setError("Could not load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const register = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id, timezone: tz }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not register.");
      } else {
        await refetch();
      }
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/events/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id }),
      });
      if (res.ok) await refetch();
    } finally {
      setBusyId(null);
    }
  };

  const now = Date.now();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Upcoming Events</h1>
      <p className="mt-1 text-sm text-slate-600">
        Live group calls and workshops you can join. Times are shown in your timezone ({tz}).
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading events...</p>
      ) : events.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No upcoming events right now. Check back soon, we announce new ones here and by email.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {events.map((e) => {
            const startMs = Date.parse(e.startsAt);
            const endMs = Date.parse(e.endsAt);
            const isLive = now >= startMs - 15 * 60_000 && now <= endMs;
            const busy = busyId === e.id;
            return (
              <div
                key={e.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900">{e.title}</h2>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {formatWhen(e.startsAt, e.endsAt, tz)}
                    </p>
                    {e.description ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{e.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-none flex-col items-stretch gap-2 sm:w-44">
                    {e.registered ? (
                      <>
                        {isLive && e.joinUrl ? (
                          <a
                            href={e.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                          >
                            Join now
                          </a>
                        ) : (
                          <span className="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                            Registered
                          </span>
                        )}
                        <a
                          href={`/api/events/ics?id=${encodeURIComponent(e.id)}`}
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-[#f97316] hover:text-[#f97316]"
                        >
                          Add to calendar
                        </a>
                        <button
                          type="button"
                          onClick={() => cancel(e.id)}
                          disabled={busy}
                          className="text-xs font-medium text-slate-400 hover:text-slate-600 disabled:opacity-60"
                        >
                          {busy ? "Working..." : "Cancel registration"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => register(e.id)}
                        disabled={busy}
                        className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c] disabled:opacity-60"
                      >
                        {busy ? "Registering..." : "Register"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
