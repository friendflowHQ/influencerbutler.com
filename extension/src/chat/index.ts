/**
 * AI Assistant full-tab page. A grounded help chat that reuses the hosted AI
 * concierge (POST /api/ai-concierge/chat, routed through the background worker
 * with the license-key bearer). Text only here; live voice lives on the website.
 * Built from the shared el() primitive + options.css, like the Deals page.
 */
import { el } from "../ui/components";
import { sendToBackground } from "../shared/messages";
import type {
  AiChatResult,
  AiChatTurn,
  VoiceSessionResult,
  VoiceToolResult,
  VoiceTranscriptResult,
} from "../shared/messages";

// Loose shape of the OpenAI Realtime events we act on (transcript + tool calls).
type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
};

const SUGGESTIONS = [
  "How do I set up the Chrome extension?",
  "How do I connect my Amazon Creator API?",
  "How does Daily Deals posting work?",
];

function main(): void {
  const root = document.getElementById("root");
  if (!root) return;

  const messages: AiChatTurn[] = [];
  let sending = false;

  const intro = el(
    "p",
    "chat-intro",
    "Ask anything about setting up and using Influencer Butler. Answers come from our help guides.",
  );
  const log = el("div", "chat-log");

  const suggestWrap = el("div", "chat-suggest");
  for (const s of SUGGESTIONS) {
    const chip = el("button", "chat-chip", s);
    chip.onclick = () => void send(s);
    suggestWrap.appendChild(chip);
  }

  const input = el("input", "chat-input");
  input.type = "text";
  input.placeholder = "Ask a question...";
  input.setAttribute("aria-label", "Ask the assistant");
  const sendBtn = el("button", "chat-send primary", "Send");
  const voiceBtn = el("button", "chat-voice", "🎙 Voice");
  voiceBtn.type = "button";
  const inputRow = el("div", "chat-input-row");
  inputRow.append(input, sendBtn, voiceBtn);

  const footer = el("p", "chat-footer");
  const still = el("span", undefined, "Still stuck? ");
  const human = el("a", undefined, "Talk to a human");
  human.href = "https://www.influencerbutler.com/dashboard/book";
  human.target = "_blank";
  human.rel = "noreferrer";
  footer.append(still, human, el("span", undefined, "."));

  const voiceAudio = document.createElement("audio");
  voiceAudio.autoplay = true;
  root.append(intro, suggestWrap, log, inputRow, footer, voiceAudio);

  function addBubble(role: "user" | "assistant" | "error", text: string): HTMLDivElement {
    const bubble = el("div", `chat-msg ${role}`, text);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  async function send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = "";
    suggestWrap.style.display = "none";

    messages.push({ role: "user", content });
    addBubble("user", content);
    const thinking = addBubble("assistant", "Thinking...");
    thinking.classList.add("thinking");

    try {
      const res = await sendToBackground<AiChatResult>({ kind: "AI_CHAT", messages });
      thinking.remove();
      if (res.ok && res.reply) {
        messages.push({ role: "assistant", content: res.reply });
        addBubble("assistant", res.reply);
      } else {
        addBubble("error", res.error || "The assistant is unavailable right now.");
      }
    } catch {
      thinking.remove();
      addBubble("error", "Could not reach the assistant.");
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ----- Voice concierge (OpenAI Realtime over WebRTC) -----
  type VoiceState = {
    pc: RTCPeerConnection;
    dc: RTCDataChannel | null;
    stream: MediaStream;
    sessionId: string | null;
    startedAt: number;
    timer: number | null;
    chunks: string[];
    assistantBuf: string;
  };
  let voice: VoiceState | null = null;

  function setVoiceActive(active: boolean): void {
    voiceBtn.classList.toggle("active", active);
    voiceBtn.textContent = active ? "■ End" : "🎙 Voice";
  }

  function handleVoiceEvent(ev: MessageEvent): void {
    let msg: RealtimeEvent;
    try { msg = JSON.parse(ev.data as string) as RealtimeEvent; } catch { return; }
    if (!msg || !msg.type || !voice) return;
    if (msg.type === "response.audio_transcript.delta" && typeof msg.delta === "string") {
      voice.assistantBuf += msg.delta;
      return;
    }
    if (msg.type === "response.audio_transcript.done" || msg.type === "response.output_audio_transcript.done") {
      const text = (typeof msg.transcript === "string" && msg.transcript) || voice.assistantBuf;
      if (text && text.trim()) { addBubble("assistant", text.trim()); voice.chunks.push("Assistant: " + text.trim()); }
      voice.assistantBuf = "";
      return;
    }
    if (msg.type === "conversation.item.input_audio_transcription.completed" && typeof msg.transcript === "string") {
      const text = msg.transcript.trim();
      if (text) { addBubble("user", text); voice.chunks.push("You: " + text); }
      return;
    }
    if (msg.type === "response.function_call_arguments.done") {
      const callId = msg.call_id || "";
      let args: Record<string, unknown> = {};
      try { args = msg.arguments ? (JSON.parse(msg.arguments) as Record<string, unknown>) : {}; } catch { args = {}; }
      void sendToBackground<VoiceToolResult>({ kind: "VOICE_TOOL", name: msg.name || "", args }).then((res) => {
        const output = res && res.ok ? (res.result ?? {}) : { error: "tool failed" };
        try {
          voice?.dc?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) } }));
          voice?.dc?.send(JSON.stringify({ type: "response.create" }));
        } catch { /* channel gone */ }
      });
    }
  }

  async function startVoice(): Promise<void> {
    if (voice) { stopVoice(); return; }
    setVoiceActive(true);

    // The OpenAI host is optional in the manifest; request it on this click.
    try {
      const granted = await chrome.permissions.request({ origins: ["https://api.openai.com/*"] });
      if (!granted) {
        setVoiceActive(false);
        addBubble("error", "Voice needs permission to reach OpenAI. Please allow it and try again.");
        return;
      }
    } catch { /* proceed; older browsers */ }

    const sess = await sendToBackground<VoiceSessionResult>({ kind: "VOICE_SESSION" });
    if (!sess || !sess.ok || !sess.value) {
      setVoiceActive(false);
      addBubble("error", sess?.error || "Could not start voice.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceActive(false);
      addBubble("error", "Microphone access is needed for voice. Please allow it and try again.");
      return;
    }

    const pc = new RTCPeerConnection();
    voice = { pc, dc: null, stream, sessionId: sess.sessionId ?? null, startedAt: Date.now(), timer: null, chunks: [], assistantBuf: "" };
    pc.ontrack = (e) => { if (e.streams && e.streams[0]) voiceAudio.srcObject = e.streams[0]; };
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    const dc = pc.createDataChannel("oai-events");
    voice.dc = dc;
    dc.onmessage = handleVoiceEvent;
    dc.onopen = () => { try { dc.send(JSON.stringify({ type: "response.create" })); } catch { /* ignore */ } };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const callsUrl = "https://api.openai.com/v1/realtime/calls" + (sess.model ? "?model=" + encodeURIComponent(sess.model) : "");
      const res = await fetch(callsUrl, {
        method: "POST",
        headers: { Authorization: "Bearer " + sess.value, "Content-Type": "application/sdp" },
        body: offer.sdp || "",
      });
      if (!res.ok) throw new Error("sdp " + res.status);
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch {
      addBubble("error", "Could not start the voice session. Please try again.");
      stopVoice();
      return;
    }

    const maxSecs = Number(sess.maxSessionSecs) || 300;
    voice.timer = window.setTimeout(() => stopVoice(), Math.max(30, maxSecs) * 1000);
  }

  function stopVoice(): void {
    const v = voice;
    voice = null;
    setVoiceActive(false);
    if (!v) return;
    if (v.timer) { try { clearTimeout(v.timer); } catch { /* ignore */ } }
    try { v.dc?.close(); } catch { /* ignore */ }
    try { v.pc.close(); } catch { /* ignore */ }
    try { v.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { voiceAudio.srcObject = null; } catch { /* ignore */ }
    const text = v.chunks.join("\n").slice(0, 60000);
    if (text.trim()) {
      void sendToBackground<VoiceTranscriptResult>({ kind: "VOICE_TRANSCRIPT", sessionId: v.sessionId, transcript: text, startedAt: v.startedAt });
    }
  }

  voiceBtn.onclick = () => void startVoice();

  sendBtn.onclick = () => void send(input.value);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void send(input.value);
  });
  input.focus();
}

main();
