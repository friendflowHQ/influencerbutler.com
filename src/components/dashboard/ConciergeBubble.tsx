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

type Role = "you" | "butler";
type ReplyImage = { url: string; alt: string };
type Entry = { id: number; role: Role; text: string; images?: ReplyImage[] };

const FULL_PAGE = "/dashboard/ai-concierge";
const BOOK_URL = "/dashboard/book";
const STORAGE_KEY = "ib_concierge_bubble_v1";
const HISTORY_SENT = 12;
// Only same-origin tutorial screenshots ever render in the chat.
const IMAGE_URL_PREFIX = "https://www.influencerbutler.com/assets/";

type Persisted = { entries: Entry[]; startedAt: number; sessionId: string | null; savedCount: number };

function safeImages(raw: unknown): ReplyImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is ReplyImage => !!i && typeof i.url === "string" && i.url.startsWith(IMAGE_URL_PREFIX))
    .slice(0, 4)
    .map((i) => ({ url: i.url, alt: typeof i.alt === "string" ? i.alt : "" }));
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

export default function ConciergeBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [starters, setStarters] = useState<string[]>([]);

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
    const saved = readPersisted();
    if (saved) {
      entriesRef.current = saved.entries;
      idRef.current = saved.entries.reduce((m, e) => Math.max(m, e.id), 0);
      startedAtRef.current = saved.startedAt;
      sessionIdRef.current = saved.sessionId;
      savedCountRef.current = saved.savedCount;
      setEntries(saved.entries);
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
    (role: Role, text: string, images?: ReplyImage[]) => {
      const clean = text.trim();
      if (!clean && !(images && images.length)) return;
      const entry: Entry = { id: ++idRef.current, role, text: clean };
      if (images && images.length) entry.images = images;
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
            client: { surface: "website", ...(firstName ? { persona: { firstName } } : {}) },
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { reply?: string; images?: unknown; error?: string };
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
        addEntry("butler", json.reply || "", safeImages(json.images));
      } catch {
        setError("The assistant is unavailable right now. Check your connection and try again.");
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, addEntry, firstName],
  );

  const startOver = useCallback(() => {
    saveTranscript(false);
    entriesRef.current = [];
    sessionIdRef.current = null;
    savedCountRef.current = 0;
    setEntries([]);
    setError("");
    persist();
  }, [saveTranscript, persist]);

  // The full page is the chat already, so the bubble would be redundant there.
  if (pathname?.startsWith(FULL_PAGE)) return null;

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
                assistant, not a person.
              </span>
            </div>
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
                  {e.text}
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
                </span>
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
            <a href={BOOK_URL} className="mt-2 inline-block text-xs text-orange-700 underline hover:text-orange-800">
              Book a human call instead
            </a>
          </form>
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
