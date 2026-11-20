"use client";

/**
 * Butler AI for logged-out visitors on the public site (pricing, help). A small
 * launcher and panel that talk to /api/ai-concierge/public-chat, which is limited
 * to read-only product questions. It hides itself for signed-in users, who get
 * the full assistant in the dashboard. The conversation lives in memory only
 * (nothing is stored in the browser or on our side). Reply rendering reuses the
 * validators in ./shared so links and guide chips follow the same safety rules
 * as the dashboard bubble.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { renderRichText, safeSources, uiLocale, type ReplySource } from "@/components/concierge/shared";

type Msg = { id: number; role: "you" | "butler"; text: string; sources?: ReplySource[] };

const HISTORY_SENT = 8;
const STARTERS = [
  "What does Influencer Butler do?",
  "How much does it cost?",
  "Is there a free trial?",
];

export default function PublicChatWidget() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idRef = useRef(0);
  const msgsRef = useRef<Msg[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Signed-in users have the dashboard assistant; show this only to visitors.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        if (alive) setSignedIn(!!data.session);
      } catch {
        // treat as a visitor
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const add = useCallback((m: Omit<Msg, "id">) => {
    msgsRef.current = [...msgsRef.current, { id: ++idRef.current, ...m }];
    setMsgs(msgsRef.current);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      setError("");
      setInput("");
      add({ role: "you", text: q });
      setBusy(true);
      try {
        const history = msgsRef.current
          .slice(-HISTORY_SENT)
          .map((m) => ({ role: m.role === "you" ? "user" : "assistant", content: m.text }));
        const res = await fetch("/api/ai-concierge/public-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history, locale: uiLocale() }),
        });
        const json = (await res.json().catch(() => ({}))) as { reply?: string; sources?: unknown; error?: string };
        if (!res.ok || !json.reply) {
          setError(json.error || "The assistant is unavailable right now. Please try again, or use our contact page.");
          return;
        }
        add({ role: "butler", text: json.reply, sources: safeSources(json.sources) });
      } catch {
        setError("Could not reach the assistant. Check your connection and try again.");
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, add],
  );

  if (!ready || signedIn) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[45] flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div
          id="ib-public-chat-panel"
          role="dialog"
          aria-label="Chat with Butler AI"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          style={{ width: "min(380px, calc(100vw - 2.5rem))", height: "min(540px, calc(100vh - 8rem))" }}
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-700 text-sm font-semibold text-white">
              B
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">Butler AI</p>
            <button
              type="button"
              onClick={close}
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
              <span className="inline-block max-w-[90%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                Hi! I&apos;m Butler AI, an AI assistant (not a person). Ask me what Influencer Butler does, how it works, or what it costs. For
                help with your own account, sign in and use the assistant in your dashboard.
              </span>
            </div>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
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
            {msgs.map((m) => (
              <div key={m.id} className={m.role === "you" ? "text-right" : ""}>
                <span
                  className={`inline-block max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm ${
                    m.role === "you" ? "bg-orange-50 text-[#9a3412]" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.role === "butler" ? renderRichText(m.text) : m.text}
                  {m.sources && (
                    <span className="mt-2 flex flex-wrap gap-2">
                      {m.sources.map((s) => (
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
              <label htmlFor="ib-public-chat-input" className="sr-only">
                Ask Butler AI a question
              </label>
              <input
                id="ib-public-chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={600}
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
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href="/signup" className="text-xs font-medium text-orange-700 underline hover:text-orange-800">
                Start your free trial
              </a>
              <a href="/contact" className="text-xs text-orange-700 underline hover:text-orange-800">
                Talk to a person
              </a>
            </span>
          </form>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close Butler AI chat" : "Ask Butler AI"}
        aria-expanded={open}
        aria-controls="ib-public-chat-panel"
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
