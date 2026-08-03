import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type {
  AiChatResult,
  AiChatTurn,
  VoiceSessionResult,
  VoiceToolResult,
  VoiceTranscriptResult,
} from "../shared/messages";

async function licenseKey(): Promise<string | null> {
  const state = await getState();
  return state.auth.licenseKey || null;
}

// AI concierge text chat. The chat page cannot hold the license key or hit our
// origin directly, so it sends the conversation here and the worker POSTs
// /api/ai-concierge/chat with the Bearer license key. Same brain as the website
// and desktop app; only text comes back.

export async function assistantChat(messages: AiChatTurn[]): Promise<AiChatResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key) return { ok: false, error: "Sign in from the popup to use the assistant." };

  try {
    const res = await fetch(ENDPOINTS.aiChat, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages }),
    });
    const data = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
    if (!res.ok || !data || typeof data.reply !== "string") {
      return { ok: false, error: data?.error || `The assistant is unavailable (HTTP ${res.status}).` };
    }
    return { ok: true, reply: data.reply };
  } catch {
    return { ok: false, error: "Network error reaching the assistant." };
  }
}

// Voice: mint a short-lived OpenAI Realtime token. The chat page uses it for the
// WebRTC SDP handshake; the license key never leaves the background worker.
export async function assistantVoiceSession(): Promise<VoiceSessionResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Sign in from the popup to use voice." };
  try {
    const res = await fetch(ENDPOINTS.voiceSession, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: "{}",
    });
    const data = (await res.json().catch(() => null)) as {
      value?: string;
      model?: string;
      maxSessionSecs?: number;
      sessionId?: string;
      error?: string;
    } | null;
    if (!res.ok || !data || !data.value) {
      return { ok: false, error: data?.error || `Voice is unavailable (HTTP ${res.status}).` };
    }
    return {
      ok: true,
      value: data.value,
      model: data.model,
      maxSessionSecs: data.maxSessionSecs,
      sessionId: data.sessionId ?? null,
    };
  } catch {
    return { ok: false, error: "Network error reaching the assistant." };
  }
}

// Voice: run one Realtime function/tool call server-side (so account tools see
// the right user) and return the result to feed back to the model.
export async function assistantVoiceTool(
  name: string,
  args: Record<string, unknown>,
): Promise<VoiceToolResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "not signed in" };
  try {
    const res = await fetch(ENDPOINTS.voiceTool, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ name, arguments: args }),
    });
    const data = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    if (!res.ok || !data) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, result: data.result };
  } catch {
    return { ok: false, error: "network error" };
  }
}

// Voice: save the transcript when a session ends (best-effort).
export async function assistantVoiceTranscript(
  sessionId: string | null,
  transcript: string,
  startedAt: number | null,
): Promise<VoiceTranscriptResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "not signed in" };
  try {
    const res = await fetch(ENDPOINTS.voiceTranscript, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ sessionId, mode: "voice", transcript, startedAt }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false, error: "network error" };
  }
}
