"use client";

/**
 * Reschedule or cancel a call from the emailed link, no login needed. The
 * signed token in the URL is the credential; the server re-checks it (and that
 * the call is still upcoming) on every request. Times render in the visitor's
 * own timezone, like the booking page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  callType: "support" | "demo";
  label: string;
  userMinutes: number;
  startMs: number;
  userEndMs: number;
  status: string;
  joinUrl: string | null;
  canChange: boolean;
};
type Slot = { startMs: number; endMs: number; userEndMs: number };
type DaySlots = { date: string; timezone: string; slots: Slot[] };
type Mode = "details" | "reschedule" | "cancel" | "moved" | "cancelled";

const TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const dayLabel = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms));
const longDay = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(ms));
const timeOf = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const tzName = (() => {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longGeneric" }).formatToParts(new Date(0)).find((p) => p.type === "timeZoneName")?.value || TZ; }
  catch { return TZ; }
})();

const primaryBtn = "rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-medium text-white hover:bg-[#9a3412] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2";
const secondaryBtn = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2";

export default function ManageBooking({ id, token }: { id: string; token: string }) {
  const [state, setState] = useState<"loading" | "invalid" | "ready">("loading");
  const [invalidMsg, setInvalidMsg] = useState("");
  const [s, setS] = useState<Summary | null>(null);
  const [mode, setMode] = useState<Mode>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [days, setDays] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");

  const qs = `id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const res = await fetch(`/api/booking/manage?${qs}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (off) return;
        if (!res.ok) { setInvalidMsg(j.error || "This link is not valid."); setState("invalid"); return; }
        setS(j as Summary);
        if ((j as Summary).status === "cancelled") setMode("cancelled");
        setState("ready");
      } catch {
        if (!off) { setInvalidMsg("We could not load your call. Check your connection and try again."); setState("invalid"); }
      }
    })();
    return () => { off = true; };
  }, [qs]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true); setError(""); setDays([]); setSelectedDay(null); setSelectedSlot(null);
    try {
      const res = await fetch(`/api/booking/manage/slots?${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Could not load times."); return; }
      setDays(j.days ?? []);
    } catch { setError("Could not load times."); }
    finally { setLoadingSlots(false); }
  }, [qs]);

  const byDay = useMemo(() => {
    const map = new Map<string, { label: string; slots: Slot[] }>();
    for (const d of days) for (const sl of d.slots) {
      const key = dayKey(sl.startMs);
      if (!map.has(key)) map.set(key, { label: dayLabel(sl.startMs), slots: [] });
      map.get(key)!.slots.push(sl);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [days]);
  const daySlots = useMemo(() => byDay.find(([k]) => k === selectedDay)?.[1]?.slots ?? [], [byDay, selectedDay]);

  const move = async () => {
    if (!selectedSlot) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/booking/manage/reschedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, t: token, startMs: selectedSlot.startMs }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setError(j.error || "Could not move that call."); if (res.status === 409) loadSlots(); return; }
      setS((cur) => (cur ? { ...cur, startMs: j.startMs, userEndMs: j.userEndMs, joinUrl: j.joinUrl ?? cur.joinUrl } : cur));
      setMode("moved");
    } catch { setError("Could not reach the server. Please try again."); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/booking/manage/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, t: token, reason }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setError(j.error || "Could not cancel that call."); return; }
      setMode("cancelled");
    } catch { setError("Could not reach the server. Please try again."); }
    finally { setBusy(false); }
  };

  const card = "mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

  if (state === "loading") return <div className={card}><p className="text-sm text-slate-600" role="status">Loading your call...</p></div>;
  if (state === "invalid" || !s) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-slate-900">We could not open that link</h1>
        <p className="mt-2 text-sm text-slate-600" role="alert">{invalidMsg}</p>
        <a href="/dashboard/book" className={`${primaryBtn} mt-4 inline-block`}>Go to Book a Call</a>
      </div>
    );
  }

  const when = `${longDay(s.startMs)} from ${timeOf(s.startMs)} to ${timeOf(s.userEndMs)}`;

  return (
    <div className={card}>
      {mode === "cancelled" && (
        <>
          <h1 className="text-xl font-semibold text-slate-900">Your call is cancelled</h1>
          <p className="mt-2 text-sm text-slate-600">A cancellation email is on its way. You can book a new time whenever it suits you.</p>
          <a href="/dashboard/book" className={`${primaryBtn} mt-4 inline-block`}>Book a new time</a>
        </>
      )}

      {mode === "moved" && (
        <>
          <h1 className="text-xl font-semibold text-slate-900">Your call is moved</h1>
          <p className="mt-2 text-sm text-slate-700">{s.label}: <strong>{when}</strong> ({tzName}).</p>
          <p className="mt-2 text-sm text-slate-600">An updated calendar invite is on its way to your inbox and replaces the old entry.</p>
          {s.joinUrl && <p className="mt-3 text-sm">Join link: <a className="text-[#c2410c] underline" href={s.joinUrl} target="_blank" rel="noreferrer">{s.joinUrl}</a></p>}
          <button type="button" onClick={() => setMode("details")} className={`${secondaryBtn} mt-4`}>Done</button>
        </>
      )}

      {(mode === "details" || mode === "reschedule" || mode === "cancel") && (
        <>
          <h1 className="text-xl font-semibold text-slate-900">Manage your call</h1>
          <p className="mt-2 text-sm text-slate-700">{s.label}</p>
          <p className="text-sm font-medium text-slate-900">{when}</p>
          <p className="text-xs text-slate-500">Shown in your timezone: {tzName} ({TZ}).</p>
          {s.joinUrl && s.canChange && <p className="mt-2 text-sm">Join link: <a className="text-[#c2410c] underline" href={s.joinUrl} target="_blank" rel="noreferrer">{s.joinUrl}</a></p>}

          {!s.canChange && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {s.status === "confirmed" ? "This call has already started or passed, so it can no longer be changed here." : `This call is ${s.status.replace("_", " ")}, so there is nothing to change.`}
              <div className="mt-3"><a href="/dashboard/book" className={`${primaryBtn} inline-block`}>Book a new time</a></div>
            </div>
          )}

          {s.canChange && mode === "details" && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={primaryBtn} onClick={() => { setMode("reschedule"); loadSlots(); }}>Reschedule</button>
              <button type="button" className={secondaryBtn} onClick={() => { setMode("cancel"); setError(""); }}>Cancel this call</button>
            </div>
          )}

          {s.canChange && mode === "reschedule" && (
            <div className="mt-5">
              <h2 className="text-sm font-semibold text-slate-700">Pick a new day</h2>
              {loadingSlots ? <p className="mt-2 text-sm text-slate-500" role="status">Loading times...</p> :
                byDay.length === 0 ? <p className="mt-2 text-sm text-slate-500">No open times in the next couple of weeks. Please check back soon.</p> :
                <div className="mt-2 flex flex-wrap gap-2">
                  {byDay.map(([key, d]) => (
                    <button key={key} type="button" aria-pressed={selectedDay === key} onClick={() => { setSelectedDay(key); setSelectedSlot(null); }}
                      className={`rounded-lg px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${selectedDay === key ? "bg-[#c2410c] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{d.label}</button>
                  ))}
                </div>}
              {selectedDay && (
                <div className="mt-4">
                  <h2 className="text-sm font-semibold text-slate-700">Pick a time</h2>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {daySlots.map((sl) => (
                      <button key={sl.startMs} type="button" aria-pressed={selectedSlot?.startMs === sl.startMs} onClick={() => setSelectedSlot(sl)}
                        className={`rounded-lg border px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${selectedSlot?.startMs === sl.startMs ? "border-[#c2410c] bg-orange-50 text-[#c2410c]" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>{timeOf(sl.startMs)}</button>
                    ))}
                  </div>
                </div>
              )}
              {selectedSlot && <p className="mt-4 text-sm text-slate-700">New time: <strong>{longDay(selectedSlot.startMs)} at {timeOf(selectedSlot.startMs)}</strong></p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} disabled={!selectedSlot || busy} onClick={move}>{busy ? "Moving..." : "Confirm new time"}</button>
                <button type="button" className={secondaryBtn} disabled={busy} onClick={() => { setMode("details"); setError(""); }}>Back</button>
              </div>
            </div>
          )}

          {s.canChange && mode === "cancel" && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h2 className="text-sm font-semibold text-rose-900">Cancel this call?</h2>
              <p className="mt-1 text-sm text-rose-900">The time will be released and we will email you a confirmation.</p>
              <label className="mt-3 block text-sm text-slate-700">
                Reason (optional)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2" disabled={busy} onClick={cancel}>{busy ? "Cancelling..." : "Yes, cancel it"}</button>
                <button type="button" className={secondaryBtn} disabled={busy} onClick={() => { setMode("details"); setError(""); }}>Keep my call</button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}
    </div>
  );
}
