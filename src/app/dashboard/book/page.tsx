"use client";

/**
 * Customer "Book a Call" page. Calendly-style: pick a call type, then a day +
 * time slot in the customer's own timezone, add a topic, and confirm. Support
 * calls require a subscription (the server enforces it; the UI nudges). Shows
 * the customer's existing/upcoming calls with cancel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { getTopic } from "@/lib/call-topics";
import { TopicPicker } from "@/components/scheduling/TopicChips";

type Slot = { startMs: number; endMs: number; userEndMs: number; types?: ("support" | "demo")[]; partner?: string };

// Partner-reserved Setup-call times (src/lib/partner-call-slots.ts), offered
// only to accounts the partner referred. `preview` = admin view-only.
type PartnerProgram = {
  key: string; label: string; partnerName: string; url: string; note: string;
  preview: boolean; limitReached: boolean;
  slots: { startMs: number; endMs: number; userEndMs: number }[];
};

// Rose palette taken from the partner's community cover art. Ribbon text is
// white on #8f4f61 (6.1:1, WCAG AA).
const PARTNER_RIBBON = "bg-[#8f4f61] text-white";
const PARTNER_CARD = "border-[#e7c3cb] bg-[#fbeef0] text-[#5c2f3b]";

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 5a.9.9 0 1 1 0-1.8A.9.9 0 0 1 8 5Zm.75 6.5h-1.5V6.75h1.5v4.75Z" />
    </svg>
  );
}

// Badge under each time so customers see which call that time is for.
function slotBadge(types: Slot["types"]): { text: string; cls: string } | null {
  if (!types?.length) return null;
  const demo = types.includes("demo");
  const support = types.includes("support");
  if (demo && support) return { text: "Setup or Priority", cls: "bg-slate-100 text-slate-700" };
  if (support) return { text: "Priority 1:1 only", cls: "bg-indigo-50 text-indigo-800" };
  return { text: "Setup call only", cls: "bg-orange-50 text-[#9a3412]" };
}
type DaySlots = { date: string; timezone: string; slots: Slot[] };
type MyBooking = {
  id: string; call_type: CallTypeKey; starts_at: string; user_ends_at: string;
  user_timezone: string | null; status: string; topic: string | null; join_url: string | null;
  manage_url?: string | null;
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
// Human-friendly zone name (e.g. "Central Time") derived from Intl itself, so it
// stays current for any IANA zone worldwide with no lookup table. Falls back to the
// raw IANA id for exotic zones or if Intl throws.
function tzFriendly(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: USER_TZ, timeZoneName: "longGeneric" }).formatToParts(new Date(0));
    return parts.find((p) => p.type === "timeZoneName")?.value || USER_TZ;
  } catch { return USER_TZ; }
}
const USER_TZ_LABEL = `${tzFriendly()} (${USER_TZ})`;

export default function BookCallPage() {
  const [isSubscriber, setIsSubscriber] = useState<boolean | null>(null);
  // Beginner plan: the Priority 1:1 call is Power User only (server is the real gate).
  const [isBeginner, setIsBeginner] = useState<boolean | null>(null);
  const [callType, setCallType] = useState<"support" | "demo">("demo");
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [confirmed, setConfirmed] = useState<{ joinUrl: string | null } | null>(null);
  const [mine, setMine] = useState<MyBooking[]>([]);
  const [partners, setPartners] = useState<PartnerProgram[]>([]);

  const loadPartners = useCallback(async () => {
    try {
      const res = await fetch("/api/booking/partner-slots", { cache: "no-store" });
      if (res.ok) { const j = await res.json(); setPartners(Array.isArray(j.programs) ? j.programs : []); }
    } catch { /* partner slots are optional */ }
  }, []);
  useEffect(() => { loadPartners(); }, [loadPartners]);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/entitlements", { cache: "no-store" });
        if (!res.ok) { setIsBeginner(false); return; }
        const j = await res.json();
        setIsBeginner(j?.planLevel === "beginner");
      } catch { setIsBeginner(false); }
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

  // Quiet refetch used when the tab regains focus: refreshes availability in
  // place without clearing the current day pick or flashing the loading state.
  // If the slot the customer had selected is no longer offered (e.g. the owner
  // just added a manual block, or someone else took it), it's dropped so they
  // can't submit a stale time, and we say why.
  const refreshSlots = useCallback(async (type: "support" | "demo") => {
    try {
      const res = await fetch(`/api/booking/slots?type=${type}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      const nextDays: DaySlots[] = j.days ?? [];
      setDays(nextDays);
      setSelectedSlot((prev) => {
        if (!prev) return prev;
        const stillOffered = nextDays.some((d) => d.slots.some((s) => s.startMs === prev.startMs));
        if (stillOffered) return prev;
        setMsg("That time is no longer available (it was just taken or blocked). Please pick another.");
        return null;
      });
    } catch { /* ignore: keep showing what we have */ }
  }, []);

  useEffect(() => { loadSlots(callType); }, [callType, loadSlots]);
  useEffect(() => { loadMine(); }, [loadMine]);

  // A booking page left open in a background tab keeps showing availability from
  // when it loaded. Re-pull slots and my bookings whenever the tab regains
  // focus, so a stale tab can't offer times the owner has since blocked.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      refreshSlots(callType);
      loadMine();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [callType, refreshSlots, loadMine]);

  // Flatten all slots and regroup by the CUSTOMER's local day.
  const byDay = useMemo(() => {
    const map = new Map<string, { label: string; slots: Slot[]; partner: boolean }>();
    const add = (s: Slot) => {
      const key = fmtDayKey(s.startMs);
      if (!map.has(key)) map.set(key, { label: fmtDayLabel(s.startMs), slots: [], partner: false });
      const day = map.get(key)!;
      day.slots.push(s);
      if (s.partner) day.partner = true;
    };
    for (const d of days) for (const s of d.slots) add(s);
    // Partner-reserved Setup times ride alongside the public ones.
    if (callType === "demo") {
      for (const p of partners) {
        if (p.limitReached) continue;
        for (const s of p.slots) add({ ...s, types: ["demo"], partner: p.key });
      }
    }
    for (const day of map.values()) day.slots.sort((a, b) => a.startMs - b.startMs);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [days, partners, callType]);

  const partnerFor = useCallback((key: string | undefined) => partners.find((p) => p.key === key) ?? null, [partners]);
  const selectedPartner = partnerFor(selectedSlot?.partner);

  // Guides for the picked topics, so a self-serve answer is one click away.
  const helpLinks = useMemo(
    () => topics.flatMap((k) => { const t = getTopic(k); return t?.helpSlug ? [{ slug: t.helpSlug, label: t.label }] : []; }),
    [topics],
  );

  const daySlots = useMemo(() => byDay.find(([k]) => k === selectedDay)?.[1]?.slots ?? [], [byDay, selectedDay]);

  const book = useCallback(async () => {
    if (!selectedSlot) return;
    setSubmitting(true); setMsg("");
    try {
      const res = await fetch("/api/booking/create", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: callType, startMs: selectedSlot.startMs, timezone: USER_TZ, topic, topics, name, ...(selectedSlot.partner ? { partner: selectedSlot.partner } : {}) }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMsg(j.error || "Could not book that time."); return; }
      setConfirmed({ joinUrl: j.joinUrl ?? null });
      await Promise.all([loadSlots(callType), loadMine(), loadPartners()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not book."); }
    finally { setSubmitting(false); }
  }, [selectedSlot, callType, topic, topics, name, loadSlots, loadMine, loadPartners]);

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
        <button type="button" onClick={() => { setConfirmed(null); setSelectedSlot(null); setSelectedDay(null); setTopic(""); setTopics([]); setConsent(false); }} className="mt-5 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]">Book another</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Book a call</h1>
        <p className="mt-1 text-sm text-slate-500">Times shown in your timezone: {USER_TZ_LABEL}.</p>
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
          <div className="font-semibold text-slate-900">{CALL_TYPES.demo.label}</div>
          <div className="mt-1 text-sm text-slate-500">{CALL_TYPES.demo.description}</div>
        </button>
        <button type="button" disabled={isSubscriber === false || isBeginner === true} onClick={() => isSubscriber !== false && isBeginner !== true && setCallType("support")}
          className={`rounded-2xl border p-4 text-left ${callType === "support" ? "border-[#f97316] ring-1 ring-[#f97316]" : "border-slate-200"} bg-white ${isSubscriber === false || isBeginner === true ? "opacity-60" : ""}`}>
          <div className="font-semibold text-slate-900">{CALL_TYPES.support.label}</div>
          <div className="mt-1 text-sm text-slate-500">{CALL_TYPES.support.description}</div>
          {isSubscriber === false && <div className="mt-2 text-xs text-slate-500">New to Butler? Book the free <strong>{CALL_TYPES.demo.label}</strong> above (or Butler AI) for setup help at no cost, or <a href="/dashboard/subscription" className="underline">start a plan</a> (no credit card required).</div>}
          {isSubscriber !== false && isBeginner === true && <div className="mt-2 text-xs text-slate-500">Priority 1:1 calls are part of the Power User plan. <a href="/dashboard/subscription" className="underline">Upgrade in one click</a> (same license key), or book the free <strong>{CALL_TYPES.demo.label}</strong> above.</div>}
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
                {d.partner && <span aria-label="includes a reserved time" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#8f4f61] align-middle" />}
              </button>
            ))}
          </div>}
      </div>

      {/* Time slots */}
      {selectedDay && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Pick a time</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {daySlots.map((s) => {
              const p = partnerFor(s.partner);
              const selected = selectedSlot?.startMs === s.startMs && selectedSlot?.partner === s.partner;
              if (p) {
                const tipId = `partner-tip-${p.key}-${s.startMs}`;
                return (
                  <div key={`${p.key}-${s.startMs}`} className="group relative">
                    <button type="button" onClick={() => setSelectedSlot(s)} aria-describedby={tipId}
                      className={`w-full rounded-lg border px-2 pb-2 pt-3 text-sm ${PARTNER_CARD} ${selected ? "ring-2 ring-[#8f4f61]" : "hover:border-[#8f4f61]"}`}>
                      <span className="block font-medium">{fmtTime(s.startMs)}</span>
                      <span className="mt-1 inline-block rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[#5c2f3b]">Reserved Setup call</span>
                    </button>
                    <a href={p.url} target="_blank" rel="noreferrer" aria-describedby={tipId}
                      className={`absolute -right-1.5 -top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${PARTNER_RIBBON} hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8f4f61] focus-visible:ring-offset-2`}>
                      {p.label}<InfoIcon />
                      <span className="sr-only"> (opens {p.partnerName}&apos;s website in a new tab)</span>
                    </a>
                    <span id={tipId} role="tooltip"
                      className="pointer-events-none invisible absolute right-0 top-5 z-20 w-60 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      {p.note}
                    </span>
                  </div>
                );
              }
              return (
                <button key={s.startMs} type="button" onClick={() => setSelectedSlot(s)}
                  className={`rounded-lg border px-2 py-2 text-sm ${selected ? "border-[#f97316] bg-orange-50 text-[#c2410c]" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                  <span className="block">{fmtTime(s.startMs)}</span>
                  {(() => {
                    const b = slotBadge(s.types);
                    return b ? <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.text}</span> : null;
                  })()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Topic + confirm */}
      {selectedSlot && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-700">
            {CALL_TYPES[callType].label} on <strong>{fmtDayLabel(selectedSlot.startMs)}</strong> at <strong>{fmtTime(selectedSlot.startMs)}</strong> ({tzFriendly()})
          </div>
          {selectedPartner && (
            <p className={`mt-2 rounded-lg border px-3 py-2 text-xs ${PARTNER_CARD}`}>
              <strong>Reserved for {selectedPartner.partnerName}&apos;s students.</strong> {selectedPartner.preview
                ? "Admin preview: only accounts referred by this partner can book this time."
                : "Thanks for joining the live training! One reserved call per student."}
            </p>
          )}
          <label className="mt-3 block text-sm">
            <span className="text-slate-500">Your name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="mt-3">
            <TopicPicker value={topics} onChange={setTopics} legend="What is this call about?" hint="This helps us prepare the right person and materials." />
            {topics.length === 0 && <p className="mt-1 text-xs text-slate-500">Pick at least one to continue.</p>}
            {helpLinks.length > 0 && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Want to try a guide first?{" "}
                {helpLinks.map((h, i) => (
                  <span key={h.slug}>{i > 0 ? ", " : ""}<a href={`/help/tutorials/${h.slug}`} target="_blank" rel="noreferrer" className="font-medium text-[#c2410c] underline">{h.label}</a></span>
                ))}
                . You can still book either way.
              </p>
            )}
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-slate-700">Anything else we should know? <span className="text-xs text-slate-500">(optional)</span></span>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="A sentence or two so we can prepare." />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>This call is recorded, transcribed, and summarized by AI so we can prepare notes to review afterward. Any product issues or feature requests raised may be logged to our support queue so we can follow up. Check the box to confirm you understand.</span>
          </label>
          {msg && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</div>}
          <button type="button" disabled={submitting || !consent || topics.length === 0 || selectedPartner?.preview === true} onClick={book} className="mt-3 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50">
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
                  <span className="font-medium text-slate-800">{CALL_TYPES[b.call_type].label}</span>
                  <span className="ml-2 text-slate-500">{fmtDayLabel(Date.parse(b.starts_at))} at {fmtTime(Date.parse(b.starts_at))}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${b.status === "confirmed" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>{b.status}</span>
                </div>
                {b.status === "confirmed" && Date.parse(b.starts_at) > Date.now() && (
                  <div className="flex gap-2">
                    {b.join_url && <a href={b.join_url} target="_blank" rel="noreferrer" className="text-[#f97316] hover:underline">Join</a>}
                    {b.manage_url && <a href={b.manage_url} className="text-slate-700 underline hover:text-slate-900">Reschedule</a>}
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
