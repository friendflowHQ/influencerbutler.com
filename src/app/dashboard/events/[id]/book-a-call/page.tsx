"use client";

import { use, useCallback, useEffect, useState } from "react";

type Offer = { id: string; eventId: string; startsAt: string; endsAt: string };

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
  const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} to ${timeFmt.format(end)}`;
}

type Blocker = { kind: "signin" | "register"; message: string } | null;

export default function BookAFollowUpCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<Blocker>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bookedOfferId, setBookedOfferId] = useState<string | null>(null);
  const tz = browserTz();

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/call-offers?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { offers?: Offer[]; error?: string };
      if (!res.ok) {
        // A visitor who isn't signed in, or hasn't registered for this event
        // yet, gets a clear next step (sign in / register) rather than a
        // dead-end error - this page is the link people share directly.
        if (res.status === 401) {
          setBlocker({ kind: "signin", message: "Sign in (or create a free account) to see and book a call time." });
        } else if (res.status === 403) {
          setBlocker({ kind: "register", message: data.error || "You need to register for this event first." });
        } else {
          setError(data.error || "Could not load call times.");
        }
        setOffers([]);
        return;
      }
      setBlocker(null);
      setOffers(data.offers ?? []);
      setError(null);
    } catch {
      setError("Could not load call times.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const claim = async (offerId: string) => {
    setBusyId(offerId);
    setError(null);
    try {
      const res = await fetch("/api/events/call-offers/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, eventId, timezone: tz }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not book that time.");
        await refetch();
        return;
      }
      setBookedOfferId(offerId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Book a 1:1 follow-up call</h1>
      <p className="mt-1 text-sm text-slate-600">
        A few times are open for people who registered for this event. Times are shown in your
        timezone ({tz}).
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {blocker ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
          <p className="text-slate-700">{blocker.message}</p>
          {blocker.kind === "signin" ? (
            <a
              href={`/login?next=${encodeURIComponent(`/dashboard/events/${eventId}/book-a-call`)}`}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c]"
            >
              Sign in or sign up
            </a>
          ) : (
            <>
              <a
                href={`/events/${eventId}`}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c]"
              >
                Register for the event
              </a>
              <p className="mt-2 text-xs text-slate-500">Then come back to this link to book your call.</p>
            </>
          )}
        </div>
      ) : null}

      {blocker ? null : bookedOfferId ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          You&apos;re booked. Check your email for the details and calendar invite.
        </div>
      ) : loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading...</p>
      ) : offers.length === 0 && !error ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No call times are open right now - they may already be fully booked.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {offers.map((o) => (
            <div
              key={o.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm font-medium text-slate-700">{formatWhen(o.startsAt, o.endsAt, tz)}</p>
              <button
                type="button"
                onClick={() => claim(o.id)}
                disabled={busyId === o.id}
                className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c] disabled:opacity-60"
              >
                {busyId === o.id ? "Booking..." : "Book this time"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
