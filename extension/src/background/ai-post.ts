import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { AiPostRequest, GenAiPostResult } from "../shared/messages";

// "Your AI Post is ready": the creator's formula + the product's facts go to the
// site, which fills the formula and has the free Influencer Butler AI rewrite it.
// Runs here because the content script cannot hold the license key or hit our
// origin (same split as social-schedule.ts).
export async function generateAiPost(input: AiPostRequest): Promise<GenAiPostResult> {
  const key = (await getState()).auth.licenseKey;
  if (!key) return { ok: false, error: "Sign in from the extension popup with your license key." };
  try {
    const res = await fetch(ENDPOINTS.aiPost, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; post?: string; comment?: string | null; source?: "ai" | "formula"; error?: string }
      | null;
    if (!res.ok || !data?.ok || !data.post) {
      return { ok: false, error: data?.error ?? "Could not write the post right now." };
    }
    return { ok: true, post: data.post, comment: data.comment ?? null, source: data.source ?? "formula" };
  } catch {
    return { ok: false, error: "Network error writing the post. Are you online?" };
  }
}
