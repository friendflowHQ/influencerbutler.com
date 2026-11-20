"use client";

/**
 * Floating Butler AI chat bubble for every /dashboard page, the website twin of
 * the desktop app's <ib-chat-bubble>. Text only: it talks to the same
 * /api/ai-concierge/chat route as the full page (cookie auth, surface
 * "website"). Voice and the long-form view live on /dashboard/ai-concierge, so
 * the bubble hides itself there. The conversation survives route changes (the
 * dashboard layout never unmounts) and reloads (sessionStorage), and is saved
 * once per session to /api/ai-concierge/transcript for the owner to review.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_HOURS } from "@/lib/support-hours";
import { nudgeForPath, type Nudge } from "@/lib/concierge-nudges";
import {
  type Role,
  type Rating,
  type Entry,
  type Extras,
  FEEDBACK_REASONS,
  renderRichText,
  safeImages,
  safeVideo,
  safeCallTypes,
  safeSources,
  uiLocale,
  uiPlatform,
} from "@/components/concierge/shared";


const NUDGE_DISMISSED_KEY = "ib_concierge_nudges_dismissed_v1";
const NUDGE_OFF_KEY = "ib_concierge_nudges_off_v1";
const NUDGE_SESSION_KEY = "ib_concierge_nudge_shown_v1";
const NUDGE_DELAY_MS = 8000;

const FULL_PAGE = "/dashboard/ai-concierge";
const BOOK_URL = "/dashboard/book";
const STORAGE_KEY = "ib_concierge_bubble_v1";
const HISTORY_SENT = 12;

type Persisted = { entries: Entry[]; startedAt: number; sessionId: string | null; savedCount: number };


// A one-line memory of the last thing the user asked, kept in this browser only
// (never sent anywhere) so a later visit can offer to pick up where they left off.
const MEMORY_KEY = "ib_concierge_memory_v1";
const MEMORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
type Memory = { question: string; at: number };

function readMemory(): Memory | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Memory;
    if (typeof m.question !== "string" || !m.question || typeof m.at !== "number") return null;
    if (Date.now() - m.at > MEMORY_MAX_AGE_MS) {
      localStorage.removeItem(MEMORY_KEY);
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

function writeMemory(question: string): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ question: question.slice(0, 200), at: Date.now() }));
  } catch {
    // storage blocked: the feature just stays off
  }
}

function clearMemory(): void {
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch {
    // ignore
  }
}

function readPersisted(): Persisted | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!Array.isArray(p.entries)) return null;
    return p;
  } catch {
    return null;
  }
}

function starterQuestions(): string[] {
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  return [
    "How do I get started?",
    "What does my plan include?",
    mac ? "How do I move to a new Mac?" : "How do I move to a new computer?",
    "I'm seeing an error. Can you help?",
  ];
}

function SupportHoursTip() {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label="Support hours"
        aria-expanded={shown}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-extrabold text-slate-500 hover:border-orange-400 hover:text-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
      >
        ?
      </button>
      {shown && (
        <span
          role="note"
          className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-xl border border-orange-200 border-t-[3px] border-t-orange-700 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-lg"
        >
          <span className="mb-0.5 block font-extrabold text-slate-900">Support hours</span>
          {SUPPORT_HOURS}
        </span>
      )}
    </span>
  );
}

export default function ConciergeBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [starters, setStarters] = useState<string[]>([]);
  // Id of the answer whose thumbs-down is waiting for an optional reason.
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  // What they asked last time (a previous visit), offered once on a fresh chat.
  const [memory, setMemory] = useState<Memory | null>(null);
  // The contextual tip card shown above the launcher, when there is one.
  const [nudge, setNudge] = useState<Nudge | null>(null);

  const entriesRef = useRef<Entry[]>([]);
  const idRef = useRef(0);
  const startedAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const savedCountRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const persist = useCallback(() => {
    try {
      const data: Persisted = {
        entries: entriesRef.current,
        startedAt: startedAtRef.current,
        sessionId: sessionIdRef.current,
        savedCount: savedCountRef.current,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // sessionStorage may be unavailable - the chat just won't survive a reload
    }
  }, []);

  // Restore the conversation and look up the first name once, after mount.
  useEffect(() => {
    setStarters(starterQuestions());
    // Swap in starters tailored to the plan, account age, language and computer.
    // The static set above stays if this fails.
    (async () => {
      try {
        const qs = new URLSearchParams({ locale: uiLocale() });
        const platform = uiPlatform();
        if (platform) qs.set("platform", platform);
        const res = await fetch(`/api/ai-concierge/starters?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { starters?: unknown };
        const list = Array.isArray(json.starters) ? json.starters.filter((s): s is string => typeof s === "string").slice(0, 4) : [];
        if (list.length) setStarters(list);
      } catch {
        // keep the static starters
      }
    })();
    const saved = readPersisted();
    if (saved) {
      entriesRef.current = saved.entries;
      idRef.current = saved.entries.reduce((m, e) => Math.max(m, e.id), 0);
      startedAtRef.current = saved.startedAt;
      sessionIdRef.current = saved.sessionId;
      savedCountRef.current = saved.savedCount;
      setEntries(saved.entries);
    } else {
      setMemory(readMemory());
    }
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userData.user.id)
          .maybeSingle();
        const name = (data as { display_name?: string | null } | null)?.display_name?.trim().split(/\s+/)[0] ?? "";
        if (alive && name && !name.includes("@")) setFirstName(name.slice(0, 60));
      } catch {
        // generic greeting is fine
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // A single, quiet tip per session: after a few seconds on a page that has one,
  // when the chat is closed and unused. Dismissals and "no tips" live in this
  // browser only.
  useEffect(() => {
    setNudge(null);
    if (open || entries.length > 0) return;
    const candidate = nudgeForPath(pathname);
    if (!candidate) return;
    try {
      if (localStorage.getItem(NUDGE_OFF_KEY) === "1") return;
      if (sessionStorage.getItem(NUDGE_SESSION_KEY) === "1") return;
      const gone = JSON.parse(localStorage.getItem(NUDGE_DISMISSED_KEY) || "[]") as unknown;
      if (Array.isArray(gone) && gone.includes(candidate.id)) return;
    } catch {
      return; // storage blocked: skip tips rather than nag on every page
    }
    const timer = window.setTimeout(() => {
      setNudge(candidate);
      try {
        sessionStorage.setItem(NUDGE_SESSION_KEY, "1");
      } catch {
        // ignore
      }
    }, NUDGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, open, entries.length]);

  const dismissNudge = useCallback((id: string, never = false) => {
    setNudge(null);
    try {
      if (never) localStorage.setItem(NUDGE_OFF_KEY, "1");
      const gone = JSON.parse(localStorage.getItem(NUDGE_DISMISSED_KEY) || "[]") as unknown;
      const list = Array.isArray(gone) ? gone.filter((g): g is string => typeof g === "string") : [];
      if (!list.includes(id)) localStorage.setItem(NUDGE_DISMISSED_KEY, JSON.stringify([...list, id].slice(-20)));
    } catch {
      // ignore
    }
  }, []);

  // Best-effort transcript save. Serialized so a second save reuses the row id
  // the first one created instead of inserting a duplicate.
  const saveTranscript = useCallback(
    (keepalive: boolean) => {
      const count = entriesRef.current.length;
      if (count === 0 || count === savedCountRef.current) return;
      const transcript = entriesRef.current
        .map((e) => `${e.role === "you" ? "User" : "Butler AI"}: ${e.text}`)
        .join("\n");
      const startedAt = startedAtRef.current;
      saveChainRef.current = saveChainRef.current.then(async () => {
        try {
          const res = await fetch("/api/ai-concierge/transcript", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sessionIdRef.current, mode: "text", startedAt, transcript }),
            keepalive,
          });
          if (!res.ok) return;
          savedCountRef.current = count;
          const json = (await res.json().catch(() => null)) as { id?: string } | null;
          if (json?.id && !sessionIdRef.current) sessionIdRef.current = json.id;
          persist();
        } catch {
          // best-effort
        }
      });
    },
    [persist],
  );

  // Save when the tab goes away or the user leaves the dashboard.
  useEffect(() => {
    const onHide = () => saveTranscript(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      saveTranscript(true);
    };
  }, [saveTranscript]);

  const closePanel = useCallback(() => {
    setOpen(false);
    saveTranscript(false);
    launcherRef.current?.focus();
  }, [saveTranscript]);

  const addEntry = useCallback(
    (role: Role, text: string, extras?: Extras) => {
      const clean = text.trim();
      const hasExtras = !!extras && !!(extras.images?.length || extras.video || extras.callTypes || extras.sources);
      if (!clean && !hasExtras) return;
      const entry: Entry = { id: ++idRef.current, role, text: clean };
      if (extras?.images?.length) entry.images = extras.images;
      if (extras?.video) entry.video = extras.video;
      if (extras?.callTypes) entry.callTypes = extras.callTypes;
      if (extras?.sources) entry.sources = extras.sources;
      entriesRef.current = [...entriesRef.current, entry];
      setEntries(entriesRef.current);
      persist();
    },
    [persist],
  );

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      setError("");
      if (entriesRef.current.length === 0) {
        startedAtRef.current = Date.now();
        sessionIdRef.current = null;
        savedCountRef.current = 0;
      }
      setInput("");
      addEntry("you", q);
      writeMemory(q);
      setMemory(null);
      setBusy(true);
      try {
        const history = entriesRef.current
          .slice(-HISTORY_SENT)
          .map((e) => ({ role: e.role === "you" ? "user" : "assistant", content: e.text }));
        const res = await fetch("/api/ai-concierge/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history,
            client: {
              surface: "website",
              locale: uiLocale(),
              page: pathname || undefined,
              platform: uiPlatform(),
              ...(firstName ? { persona: { firstName } } : {}),
            },
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          reply?: string;
          images?: unknown;
          video?: unknown;
          booking?: unknown;
          sources?: unknown;
          error?: string;
        };
        if (!res.ok) {
          setError(
            res.status === 401
              ? "Please sign in again to keep chatting."
              : res.status === 429
                ? json.error || "You're sending messages quickly. Try again in a few minutes."
                : "The assistant is unavailable right now.",
          );
          return;
        }
        addEntry("butler", json.reply || "", {
          images: safeImages(json.images),
          video: safeVideo(json.video),
          callTypes: safeCallTypes(json.booking),
          sources: safeSources(json.sources),
        });
      } catch {
        setError("The assistant is unavailable right now. Check your connection and try again.");
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, addEntry, firstName, pathname],
  );

  // Thumbs up/down on an answer. Best-effort: a failed save never shows an error.
  const rate = useCallback(
    (id: number, rating: Rating, reason?: string) => {
      const idx = entriesRef.current.findIndex((e) => e.id === id);
      if (idx < 0) return;
      const answer = entriesRef.current[idx];
      const question = [...entriesRef.current.slice(0, idx)].reverse().find((e) => e.role === "you")?.text ?? "";
      entriesRef.current = entriesRef.current.map((e) => (e.id === id ? { ...e, rating } : e));
      setEntries(entriesRef.current);
      persist();
      void fetch("/api/ai-concierge/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating,
          reason,
          question,
          answer: answer.text,
          surface: "website",
          page: pathname || undefined,
          locale: uiLocale(),
        }),
      }).catch(() => undefined);
    },
    [persist, pathname],
  );

  const startOver = useCallback(() => {
    saveTranscript(false);
    entriesRef.current = [];
    sessionIdRef.current = null;
    savedCountRef.current = 0;
    setEntries([]);
    setError("");
    setMemory(null);
    persist();
  }, [saveTranscript, persist]);

  // Wipes this browser's chat: the conversation and the "last time" memory.
  const clearHistory = useCallback(() => {
    startOver();
    clearMemory();
  }, [startOver]);

  // The full page is the chat already, so the bubble would be redundant there.
  if (pathname?.startsWith(FULL_PAGE)) return null;

  // The booking page pre-fills "what is this call about" from the user's own
  // latest question, so they never have to explain it twice.
  const lastQuestion = [...entries].reverse().find((e) => e.role === "you")?.text ?? "";
  const bookHref = lastQuestion ? `${BOOK_URL}?topic=${encodeURIComponent(lastQuestion.slice(0, 300))}` : BOOK_URL;

  return (
    <div className="fixed bottom-5 right-5 z-[45] flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div
          id="ib-concierge-panel"
          role="dialog"
          aria-label="Butler AI chat"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closePanel();
            }
          }}
          className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          style={{ width: "min(380px, calc(100vw - 2.5rem))", height: "min(560px, calc(100vh - 8rem))" }}
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-700 text-sm font-semibold text-white"
            >
              B
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">Butler AI</p>
              <a href={FULL_PAGE} className="text-xs text-orange-700 underline hover:text-orange-800">
                Open full assistant
              </a>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={startOver}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
              >
                New chat
              </button>
            )}
            {(entries.length > 0 || memory) && (
              <button
                type="button"
                onClick={clearHistory}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
              >
                Clear history
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close chat"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div ref={logRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <div>
              <span className="inline-block max-w-[85%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                {firstName ? `Hi ${firstName}! ` : "Hi! "}I&apos;m Butler AI. Ask me anything about Influencer Butler. I&apos;m an AI
                assistant, not a person. I can explain features, find guides and videos, check your plan, and book a human
                call. I can&apos;t change your billing or run butlers for you.
              </span>
            </div>
            {entries.length === 0 && memory && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-slate-800">
                <p>
                  Last time you asked: <span className="font-medium">&ldquo;{memory.question}&rdquo;</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send(`Let's pick up where we left off. I asked: ${memory.question}`)}
                    className="rounded-full bg-orange-700 px-3 py-1 text-xs font-medium text-white hover:bg-orange-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    Pick up where we left off
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearMemory();
                      setMemory(null);
                    }}
                    className="rounded-full px-3 py-1 text-xs text-slate-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
            {entries.length === 0 && starters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    disabled={busy}
                    className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-left text-xs text-orange-900 hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {entries.map((e) => (
              <div key={e.id} className={e.role === "you" ? "text-right" : ""}>
                <span
                  className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm ${
                    e.role === "you" ? "bg-orange-50 text-[#9a3412]" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {e.role === "butler" ? renderRichText(e.text) : e.text}
                  {e.images?.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.url}
                      src={img.url}
                      alt={img.alt}
                      loading="lazy"
                      className="mt-2 block max-w-full rounded-lg border border-slate-200"
                    />
                  ))}
                  {e.video && (
                    <a
                      href={e.video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-slate-900 no-underline hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                    >
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-700 text-xs text-white">
                        &#9654;
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{e.video.title}</span>
                        <span className="block text-xs text-slate-600">Watch the video (opens YouTube)</span>
                      </span>
                    </a>
                  )}
                  {e.callTypes && (
                    <span className="mt-2 block rounded-xl border border-orange-200 bg-white p-3 text-slate-900">
                      <span className="block text-sm font-semibold">Book a call</span>
                      {e.callTypes.map((ct) => (
                        <a
                          key={ct.key}
                          href={bookHref}
                          className="mt-2 block rounded-lg border border-slate-200 px-3 py-2 no-underline hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                        >
                          <span className="block text-sm font-medium text-slate-900">
                            {ct.label}
                            {ct.userMinutes ? ` (${ct.userMinutes} min)` : ""}
                          </span>
                          {ct.description && <span className="block text-xs text-slate-600">{ct.description}</span>}
                          <span className="mt-1 block text-xs font-medium text-orange-700">Pick a time</span>
                        </a>
                      ))}
                    </span>
                  )}
                  {e.sources && (
                    <span className="mt-2 flex flex-wrap gap-2">
                      {e.sources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-medium text-orange-700 no-underline hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                        >
                          Read the full guide: {s.title}
                        </a>
                      ))}
                    </span>
                  )}
                </span>
                {e.role === "butler" && e.text && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-1 text-xs text-slate-600">
                    {e.rating ? (
                      <span role="status">Thanks for the feedback.</span>
                    ) : reasonFor === e.id ? (
                      <>
                        <span>What went wrong?</span>
                        {FEEDBACK_REASONS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setReasonFor(null);
                              rate(e.id, "down", r);
                            }}
                            className="rounded-full border border-slate-300 bg-white px-2 py-0.5 hover:border-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                          >
                            {r}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setReasonFor(null);
                            rate(e.id, "down");
                          }}
                          className="rounded-full px-2 py-0.5 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                        >
                          Skip
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="sr-only">Was this answer helpful?</span>
                        <button
                          type="button"
                          onClick={() => rate(e.id, "up")}
                          aria-label="This answer helped"
                          className="rounded-md px-1.5 py-0.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 10v11H3V10h4zm0 0l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasonFor(e.id)}
                          aria-label="This answer did not help"
                          className="rounded-md px-1.5 py-0.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17 14V3h4v11h-4zm0 0l-4 8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div>
                <span className="inline-block rounded-2xl bg-slate-100 px-3 py-2 text-sm italic text-slate-600">Thinking...</span>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mx-3 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t border-slate-200 p-3"
          >
            <div className="flex gap-2">
              <label htmlFor="ib-concierge-input" className="sr-only">
                Ask Butler AI a question
              </label>
              <input
                id="ib-concierge-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={2000}
                autoComplete="off"
                placeholder="Ask a question..."
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <span className="mt-2 inline-flex items-center gap-2">
              <a href={bookHref} className="text-xs text-orange-700 underline hover:text-orange-800">
                Book a human call instead
              </a>
              <SupportHoursTip />
            </span>
          </form>
        </div>
      )}

      {!open && nudge && (
        <div
          role="note"
          aria-label="Tip from Butler AI"
          className="max-w-[260px] rounded-2xl border border-orange-200 border-b-[3px] border-b-orange-700 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-lg"
        >
          <p>{nudge.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dismissNudge(nudge.id);
                setOpen(true);
                void send(nudge.question);
              }}
              className="rounded-full bg-orange-700 px-3 py-1 text-xs font-medium text-white hover:bg-orange-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2"
            >
              Ask Butler AI
            </button>
            <button
              type="button"
              onClick={() => dismissNudge(nudge.id)}
              className="rounded-full px-2 py-1 text-xs text-slate-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={() => dismissNudge(nudge.id, true)}
              className="rounded-full px-2 py-1 text-xs text-slate-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
            >
              Never show tips
            </button>
          </div>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? closePanel() : setOpen(true))}
        aria-label={open ? "Close Butler AI chat" : "Ask Butler AI"}
        aria-expanded={open}
        aria-controls="ib-concierge-panel"
        className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        style={{ background: "linear-gradient(135deg,#ea580c,#c2410c)" }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
        )}
      </button>
    </div>
  );
}
