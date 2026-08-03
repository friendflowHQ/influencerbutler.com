"use client";

/**
 * Customer "Book a Call" page. Calendly-style: pick a call type, then a day +
 * time slot in the customer's own timezone, add a topic, and confirm. Support
 * calls require a subscription (the server enforces it; the UI nudges). Shows
 * the customer's existing/upcoming calls with cancel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Slot = { startMs: number; endMs: number; userEndMs: number };
type DaySlots = { date: string; timezone: string; slots: Slot[] };
type MyBooking = {
  id: string; call_type: "support" | "demo"; starts_at: string; user_ends_at: string;
  user_timezone: string | null; status: string; topic: string | null; join_url: string | null;
};

const USER_TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

function fmtDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: USER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function fmtDayLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: USER_TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms));
}
function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: USER_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

export default function BookCallPage() {
  const [isSubscriber, setIsSubscriber] = useState<boolean | null>(null);
  const [callType, setCallType] = useState<"support" | "demo">("demo");
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [confirmed, setConfirmed] = useState<{ joinUrl: string | null } | null>(null);
  const [mine, setMine] = useState<MyBooking[]>([]);

  // Subscriber check (best-effort; the server is the real gate).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/subscription-details", { cache: "no-store" });
        if (!res.ok) { setIsSubscriber(false); return; }
        const j = await res.json();
        const subs = Array.isArray(j?.subscriptions) ? j.subscriptions : [];
        const active = subs.some((s: { subscription?: { status?: string } }) =>
          ["active", "on_trial", "past_due", "paused"].includes(s?.subscription?.status || ""));
        setIsSubscriber(active);
      } catch { setIsSubscriber(false); }
    })();
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/booking/mine", { cache: "no-store" });
      if (res.ok) { const j = await res.json(); setMine(j.bookings ?? []); }
    } catch { /* ignore */ }
  }, []);

  const loadSlots = useCallback(async (type: "support" | "demo") => {
    setLoadingSlots(true); setDays([]); setSelectedDay(null); setSelectedSlot(null);
    try {
      const res = await fetch(`/api/booking/slots?type=${type}`, { cache: "no-store" });
      if (!res.ok) { setMsg("Could not load times."); return; }
      const j = await res.json();
      setDays(j.days ?? []);
    } catch { setMsg("Could not load times."); }
    finally { setLoadingSlots(false); }
  }, []);

  useEffect(() => { loadSlots(callType); }, [callType, loadSlots]);
  useEffect(() => { loadMine(); }, [loadMine]);

  // Flatten all slots and regroup by the CUSTOMER's local day.
  const byDay = useMemo(() => {
    const map = new Map<string, { label: string; slots: Slot[] }>();
    for (const d of days) for (const s of d.slots) {
      const key = fmtDayKey(s.startMs);
      if (!map.has(key)) map.set(key, { label: fmtDayLabel(s.startMs), slots: [] });
      map.get(key)!.slots.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [days]);

  const daySlots = useMemo(() => byDay.find(([k]) => k === selectedDay)?.[1]?.slots ?? [], [byDay, selectedDay]);

  const book = useCallback(async () => {
    if (!selectedSlot) return;
    setSubmitting(true); setMsg("");
    try {
      const res = await fetch("/api/booking/create", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: callType, startMs: selectedSlot.startMs, timezone: USER_TZ, topic, name }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMsg(j.error || "Could not book that time."); return; }
      setConfirmed({ joinUrl: j.joinUrl ?? null });
      await Promise.all([loadSlots(callType), loadMine()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not book."); }
    finally { setSubmitting(false); }
  }, [selectedSlot, callType, topic, name, loadSlots, loadMine]);

  const cancel = useCallback(async (id: string) => {
    if (!confirm("Cancel this call?")) return;
    try {
      const res = await fetch("/api/booking/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (res.ok) { await loadMine(); await loadSlots(callType); }
    } catch { /* ignore */ }
  }, [loadMine, loadSlots, callType]);

  if (confirmed) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">You&apos;re booked</h1>
        <p className="mt-2 text-sm text-slate-600">A confirmation with a calendar invite is on its way to your inbox.</p>
        {confirmed.joinUrl ? (
          <p className="mt-3 text-sm">Join link: <a className="text-[#f97316] hover:underline" href={confirmed.joinUrl} target="_blank" rel="noreferrer">{confirmed.joinUrl}</a></p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Your join link will be emailed to you shortly.</p>
        )}
        <button type="button" onClick={() => { setConfirmed(null); setSelectedSlot(null); setSelectedDay(null); setTopic(""); setConsent(false); }} className="mt-5 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]">Book another</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Book a call</h1>
        <p className="mt-1 text-sm text-slate-500">Times shown in your timezone ({USER_TZ}).</p>
      </div>

      {/* Instant AI concierge - no scheduling, starts right away. */}
      <a href="/dashboard/ai-concierge"
        className="block rounded-2xl border border-[#f97316] bg-orange-50 p-4 hover:bg-orange-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-900">Talk to Butler AI now</div>
            <div className="mt-1 text-sm text-slate-600">Instant, available 24/7. Get a live walkthrough or setup help by voice or text, no waiting for a slot.</div>
          </div>
          <span className="shrink-0 rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white">Start now</span>
        </div>
      </a>

      <div className="text-xs uppercase tracking-wide text-slate-400">Or book a call with a human</div>

      {/* Call type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setCallType("demo")}
          className={`rounded-2xl border p-4 text-left ${callType === "demo" ? "border-[#f97316] ring-1 ring-[#f97316]" : "border-slate-200"} bg-white`}>
          <div className="font-semibold text-slate-900">Demo call</div>
          <div className="mt-1 text-sm text-slate-500">A 2-hour walkthrough of Influencer Butler, tailored to you.</div>
        </button>
        <button type="button" disabled={isSubscriber === false} onClick={() => isSubscriber !== false && setCallType("support")}
          className={`rounded-2xl border p-4 text-left ${callType === "support" ? "border-[#f97316] ring-1 ring-[#f97316]" : "border-slate-200"} bg-white ${isSubscriber === false ? "opacity-60" : ""}`}>
          <div className="font-semibold text-slate-900">Support call</div>
          <div className="mt-1 text-sm text-slate-500">A 45-minute 1:1 to work through an issue with your setup.</div>
          {isSubscriber === false && <div className="mt-2 text-xs text-[#c2410c]">For subscribers. <a href="/dashboard/subscription" className="underline">Start a plan</a> (no credit card required) to book one.</div>}
        </button>
      </div>

      {/* Day selector */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Pick a day</h2>
        {loadingSlots ? <p className="mt-2 text-sm text-slate-400">Loading times…</p> :
          byDay.length === 0 ? <p className="mt-2 text-sm text-slate-400">No open times in the next couple of weeks. Please check back.</p> :
          <div className="mt-2 flex flex-wrap gap-2">
            {byDay.map(([key, d]) => (
              <button key={key} type="button" onClick={() => { setSelectedDay(key); setSelectedSlot(null); }}
                className={`rounded-lg px-3 py-1.5 text-sm ${selectedDay === key ? "bg-[#f97316] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {d.label}
              </button>
            ))}
          </div>}
      </div>

      {/* Time slots */}
      {selectedDay && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Pick a time</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {daySlots.map((s) => (
              <button key={s.startMs} type="button" onClick={() => setSelectedSlot(s)}
                className={`rounded-lg border px-2 py-2 text-sm ${selectedSlot?.startMs === s.startMs ? "border-[#f97316] bg-orange-50 text-[#c2410c]" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                {fmtTime(s.startMs)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Topic + confirm */}
      {selectedSlot && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-700">
            {callType === "support" ? "Support call" : "Demo call"} on <strong>{fmtDayLabel(selectedSlot.startMs)}</strong> at <strong>{fmtTime(selectedSlot.startMs)}</strong> ({USER_TZ})
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-slate-500">Your name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="mt-3 block text-sm">
            <span className="text-slate-500">What would you like to cover?</span>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="A sentence or two so we can prepare." />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>This call is recorded and transcribed so we can prepare notes for you to review afterward. Check the box to confirm you understand.</span>
          </label>
          {msg && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</div>}
          <button type="button" disabled={submitting || !consent} onClick={book} className="mt-3 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50">
            {submitting ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      )}

      {/* My calls */}
      {mine.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Your calls</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {mine.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{b.call_type === "support" ? "Support" : "Demo"}</span>
                  <span className="ml-2 text-slate-500">{fmtDayLabel(Date.parse(b.starts_at))} at {fmtTime(Date.parse(b.starts_at))}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${b.status === "confirmed" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>{b.status}</span>
                </div>
                {b.status === "confirmed" && Date.parse(b.starts_at) > Date.now() && (
                  <div className="flex gap-2">
                    {b.join_url && <a href={b.join_url} target="_blank" rel="noreferrer" className="text-[#f97316] hover:underline">Join</a>}
                    <button type="button" onClick={() => cancel(b.id)} className="text-slate-400 hover:text-rose-600">Cancel</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
