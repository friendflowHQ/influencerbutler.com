import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { AiChatResult, AiChatTurn } from "../shared/messages";

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
