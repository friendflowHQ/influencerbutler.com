import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type {
  FeedbackInput,
  FeedbackResult,
  RichFeedbackInput,
  RichFeedbackResult,
  MyFeedbackItem,
  MyFeedbackListResult,
  DismissFeedbackResult,
} from "../shared/messages";

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

// ---- Rich feedback (the chat bubble's Report view) --------------------------

// Local "My reports" store: the bubble's history tab reads this so it works even
// when the user is anonymous (the server has no id to key on then). Kept in its
// own chrome.storage.local key (no schema bump), capped, newest-first.
const MY_FEEDBACK_KEY = "ib-my-feedback";
const MY_FEEDBACK_CAP = 50;

async function readLocalFeedback(): Promise<MyFeedbackItem[]> {
  try {
    const got = await chrome.storage.local.get(MY_FEEDBACK_KEY);
    const rows = got?.[MY_FEEDBACK_KEY];
    return Array.isArray(rows) ? (rows as MyFeedbackItem[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalFeedback(rows: MyFeedbackItem[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [MY_FEEDBACK_KEY]: rows.slice(0, MY_FEEDBACK_CAP) });
  } catch {
    /* storage full / unavailable: the report still sent, only history is best-effort */
  }
}

export async function listLocalFeedback(): Promise<MyFeedbackListResult> {
  const rows = await readLocalFeedback();
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { ok: true, submissions: rows };
}

export async function dismissLocalFeedback(id: string): Promise<DismissFeedbackResult> {
  if (!id) return { ok: false };
  const rows = await readLocalFeedback();
  await writeLocalFeedback(rows.filter((r) => r.id !== id));
  return { ok: true };
}

// A compact, redaction-friendly diagnostic blob. The extension has no log ring,
// so this is the ambient context that helps triage: version, page, environment.
function collectLogs(pageUrl?: string): string {
  const lines = [
    "== Extension ==",
    `Version: ${extensionVersion()}`,
    `Browser: chrome`,
    `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
    `Page: ${pageUrl || "(unknown)"}`,
    `Captured at: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}

export async function submitFeedbackRich(input: RichFeedbackInput): Promise<RichFeedbackResult> {
  const title = (input.title || "").trim();
  if (!title) return { ok: false, error: "Please enter a title." };
  const description = (input.description || "").trim();

  const state = await getState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.auth.licenseKey) headers.Authorization = `Bearer ${state.auth.licenseKey}`;

  const screenshots = Array.isArray(input.screenshots) ? input.screenshots.slice(0, 6) : [];
  const body = {
    feedback_type: input.type,
    title,
    // The server requires a non-empty message; fall back to the title when the
    // user left the description blank.
    message: description || title,
    user_email: (input.userEmail || "").trim() || null,
    page_url: input.pageUrl ?? null,
    ext_version: extensionVersion(),
    browser: "chrome",
    screenshots,
    logs: input.attachLogs === false ? null : collectLogs(input.pageUrl),
  };

  let serverId: string | null = null;
  try {
    const response = await fetch(ENDPOINTS.feedback, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: "Could not send right now. Try again in a minute." };
    }
    const data = (await response.json().catch(() => ({}))) as {
      migrationPending?: boolean;
      id?: string;
    };
    if (data.migrationPending) {
      return { ok: false, error: "Feedback is being set up. Please try again soon." };
    }
    serverId = typeof data.id === "string" && data.id ? data.id : null;
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }

  // Record locally for the "My reports" list (best-effort; never fails the send).
  const id = serverId || `fb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const rows = await readLocalFeedback();
  rows.unshift({
    id,
    type: input.type,
    title,
    status: "sent",
    createdAt: new Date().toISOString(),
    attachmentCount: screenshots.length,
  });
  await writeLocalFeedback(rows);

  return { ok: true, id };
}
