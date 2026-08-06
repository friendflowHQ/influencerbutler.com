"use client";

/**
 * Butler AI concierge session UI. Two ways to talk to the same agent:
 *   - Voice: OpenAI Realtime over WebRTC. We mint an ephemeral token from our
 *     server, connect a peer connection with the mic, and exchange events on the
 *     "oai-events" data channel. Tool calls are round-tripped to our server so
 *     they run with the user's identity.
 *   - Text: the cheap Groq chat route with the same persona + tools.
 * On end, the transcript is saved for the owner to review. A hard client timer
 * caps the (metered) voice session.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Role = "you" | "butler";
type ReplyImage = { url: string; alt: string };
type Entry = { id: number; role: Role; text: string; images?: ReplyImage[] };

// Only same-origin tutorial screenshots ever render in the transcript.
const IMAGE_URL_PREFIX = "https://www.influencerbutler.com/assets/";

function safeImages(raw: unknown): ReplyImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is ReplyImage => !!i && typeof i.url === "string" && i.url.startsWith(IMAGE_URL_PREFIX))
    .slice(0, 4)
    .map((i) => ({ url: i.url, alt: typeof i.alt === "string" ? i.alt : "" }));
}
type Phase = "intro" | "connecting" | "voice" | "text" | "ended";

const BOOK_URL = "/dashboard/book";

export default function AiConcierge() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [consent, setConsent] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textBusy, setTextBusy] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const entriesRef = useRef<Entry[]>([]);
  const partialRef = useRef<string>("");
  const savedRef = useRef(false);
  const idRef = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  const addEntry = useCallback((role: Role, text: string, images?: ReplyImage[]) => {
    const clean = text.trim();
    if (!clean && !(images && images.length)) return;
    const entry: Entry = { id: ++idRef.current, role, text: clean };
    if (images && images.length) entry.images = images;
    entriesRef.current = [...entriesRef.current, entry];
    setEntries(entriesRef.current);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries, partial]);

  const buildTranscript = useCallback(
    () => entriesRef.current.map((e) => `${e.role === "you" ? "User" : "Butler AI"}: ${e.text}`).join("\n"),
    [],
  );

  const saveTranscript = useCallback(async (mode: "voice" | "text") => {
    if (savedRef.current) return;
    savedRef.current = true;
    const transcript = buildTranscript();
    if (!transcript) return;
    try {
      await fetch("/api/ai-concierge/transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, mode, startedAt: startedAtRef.current, transcript }),
      });
    } catch { /* best-effort */ }
  }, [buildTranscript]);

  const teardownVoice = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { dcRef.current?.close(); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null; pcRef.current = null; streamRef.current = null;
  }, []);

  const endVoice = useCallback(async () => {
    if (partialRef.current) { addEntry("butler", partialRef.current); partialRef.current = ""; setPartial(""); }
    teardownVoice();
    setPhase("ended");
    setSecondsLeft(null);
    await saveTranscript("voice");
  }, [teardownVoice, saveTranscript, addEntry]);

  // Execute a realtime tool call on our server, then feed the result back.
  const runToolCall = useCallback(async (callId: string, name: string, argsJson: string) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(argsJson || "{}"); } catch { /* ignore */ }
    let result: unknown = { error: "tool failed" };
    try {
      const res = await fetch("/api/ai-concierge/tool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      });
      if (res.ok) result = (await res.json()).result;
    } catch { /* ignore */ }
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
      dc.send(JSON.stringify({ type: "response.create" }));
    }
  }, []);

  const handleServerEvent = useCallback((raw: string) => {
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(raw); } catch { return; }
    const type = String(ev.type || "");

    // Assistant speech transcript (delta names differ across model versions).
    if (type.endsWith("audio_transcript.delta") && typeof ev.delta === "string") {
      partialRef.current += ev.delta; setPartial(partialRef.current); return;
    }
    if (type.endsWith("audio_transcript.done")) {
      const finalText = typeof ev.transcript === "string" ? ev.transcript : partialRef.current;
      addEntry("butler", finalText); partialRef.current = ""; setPartial(""); return;
    }
    // User speech transcript.
    if (type === "conversation.item.input_audio_transcription.completed" && typeof ev.transcript === "string") {
      addEntry("you", ev.transcript); return;
    }
    // Tool call.
    if (type === "response.function_call_arguments.done") {
      const callId = String(ev.call_id || "");
      const name = String(ev.name || "");
      const argsJson = typeof ev.arguments === "string" ? ev.arguments : "{}";
      if (callId && name) void runToolCall(callId, name, argsJson);
      return;
    }
    if (type === "error") {
      const msg = (ev.error as { message?: string })?.message || "The voice session hit an error.";
      setError(msg);
    }
  }, [addEntry, runToolCall]);

  const startVoice = useCallback(async () => {
    setError(""); setPhase("connecting");
    try {
      const sres = await fetch("/api/ai-concierge/session", { method: "POST" });
      const sjson = await sres.json();
      if (!sres.ok) { setError(sjson.error || "Could not start the session."); setPhase("intro"); return; }
      sessionIdRef.current = sjson.sessionId ?? null;
      const maxSecs: number = sjson.maxSessionSecs ?? 600;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => { if (audioRef.current) audioRef.current.srcObject = e.streams[0]; };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => handleServerEvent(e.data);
      dc.onopen = () => {
        // Greet the user right away.
        dc.send(JSON.stringify({ type: "response.create", response: { instructions: "Greet the user warmly in one sentence and ask what they'd like to see or set up." } }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${sjson.value}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) { setError("Could not connect the voice session."); teardownVoice(); setPhase("intro"); return; }
      const answer = { type: "answer" as const, sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);

      startedAtRef.current = Date.now();
      setPhase("voice");
      setSecondsLeft(maxSecs);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          const next = (s ?? 0) - 1;
          if (next <= 0) { void endVoice(); return 0; }
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error && err.name === "NotAllowedError" ? "Microphone access is needed for a voice call. You can type instead." : "Could not start the voice session.");
      teardownVoice();
      setPhase("intro");
    }
  }, [handleServerEvent, teardownVoice, endVoice]);

  const startText = useCallback(() => {
    setError("");
    startedAtRef.current = Date.now();
    sessionIdRef.current = null;
    setPhase("text");
    addEntry("butler", "Hi! I'm Butler AI. Ask me anything about Influencer Butler, or tell me what you want to set up.");
  }, [addEntry]);

  const sendText = useCallback(async () => {
    const q = textInput.trim();
    if (!q || textBusy) return;
    setTextInput("");
    addEntry("you", q);
    setTextBusy(true);
    try {
      const history = entriesRef.current.map((e) => ({ role: e.role === "you" ? "user" : "assistant", content: e.text }));
      const res = await fetch("/api/ai-concierge/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, client: { surface: "website" } }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "The assistant is unavailable."); return; }
      addEntry("butler", json.reply || "", safeImages(json.images));
    } catch {
      setError("The assistant is unavailable right now.");
    } finally {
      setTextBusy(false);
    }
  }, [textInput, textBusy, addEntry]);

  const endText = useCallback(async () => {
    setPhase("ended");
    await saveTranscript("text");
  }, [saveTranscript]);

  // Clean up if the user navigates away mid-call.
  useEffect(() => () => { teardownVoice(); }, [teardownVoice]);

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <audio ref={audioRef} autoPlay className="hidden" />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Butler AI concierge</h1>
        <a href={BOOK_URL} className="text-sm text-[#f97316] hover:underline">Book a human call instead</a>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {phase === "intro" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">
            Talk to Butler AI right now for an instant walkthrough or setup help. It knows the product and can
            answer questions in real time. It is an AI assistant, not a person, and cannot access your Amazon or
            Instagram accounts.
          </p>
          <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>I understand this is an AI assistant and the conversation may be saved so the team can follow up. Voice needs microphone access.</span>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!consent} onClick={startVoice} className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50">Start voice chat</button>
            <button type="button" disabled={!consent} onClick={startText} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Type instead</button>
          </div>
        </div>
      )}

      {phase === "connecting" && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Connecting...</div>}

      {(phase === "voice" || phase === "text" || phase === "ended") && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>{phase === "voice" ? "Voice" : phase === "text" ? "Text" : "Ended"}</span>
            {phase === "voice" && secondsLeft !== null && <span>Time left {mmss(secondsLeft)}</span>}
          </div>
          <div ref={logRef} className="max-h-[52vh] space-y-3 overflow-y-auto">
            {entries.map((e) => (
              <div key={e.id} className={e.role === "you" ? "text-right" : ""}>
                <span className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${e.role === "you" ? "bg-orange-50 text-[#9a3412]" : "bg-slate-100 text-slate-800"}`}>
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
            {partial && <div><span className="inline-block max-w-[85%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500">{partial}</span></div>}
            {entries.length === 0 && phase === "voice" && <p className="text-sm text-slate-400">Listening... start talking.</p>}
          </div>

          {phase === "text" && (
            <form onSubmit={(e) => { e.preventDefault(); void sendText(); }} className="mt-3 flex gap-2">
              <input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Ask a question..." className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" disabled={textBusy || !textInput.trim()} className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50">{textBusy ? "..." : "Send"}</button>
            </form>
          )}

          {phase !== "ended" && (
            <div className="mt-3">
              <button type="button" onClick={() => (phase === "voice" ? void endVoice() : void endText())} className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">End</button>
            </div>
          )}
          {phase === "ended" && (
            <div className="mt-3">
              <button type="button" onClick={() => { savedRef.current = false; entriesRef.current = []; setEntries([]); setPhase("intro"); }} className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]">Start again</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
