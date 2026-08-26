import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { FeedbackInput, FeedbackResult } from "../shared/messages";

// Sends a single feedback submission to the site. Attaches the license key as
// a Bearer token when the user has connected one, so signed-in feedback is
// attributed; anonymous feedback is fully supported (the endpoint allows it).

// The reported version is read from the running manifest rather than a source
// constant, so it can never drift from the build the user actually has.
export function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const message = input.message?.trim() ?? "";
  if (message.length < 3) return { ok: false, error: "Please write a bit more." };

  const state = await getState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.auth.licenseKey) headers.Authorization = `Bearer ${state.auth.licenseKey}`;

  try {
    const response = await fetch(ENDPOINTS.feedback, {
      method: "POST",
      headers,
      body: JSON.stringify({
        feedback_type: input.feedbackType,
        message,
        page_url: input.pageUrl ?? null,
        ext_version: extensionVersion(),
        browser: "chrome",
      }),
    });
    if (!response.ok) {
      return { ok: false, error: "Could not send right now. Try again in a minute." };
    }
    const data = (await response.json().catch(() => ({}))) as { migrationPending?: boolean };
    if (data.migrationPending) {
      return { ok: false, error: "Feedback is being set up. Please try again soon." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }
}
