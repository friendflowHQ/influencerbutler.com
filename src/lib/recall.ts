/**
 * Recall.ai meeting-bot client. Recall sends a bot into a Google Meet, records
 * it, and produces an async transcript. We schedule a bot per booking, then a
 * webhook (or the fallback cron) pulls the recording URL + transcript back.
 *
 * Why Recall: Google restricts native Meet recording (and the Meet REST API's
 * recording/transcript fetch) to paid Workspace plans; calls here are hosted on
 * a free Gmail account, so a joining bot is the only way to capture them.
 *
 * Env: RECALL_API_KEY (required), RECALL_API_BASE (region origin, e.g.
 * "https://us-west-2.recall.ai"; defaults to us-west-2), RECALL_WEBHOOK_SECRET
 * (Svix signing secret for webhook verification).
 *
 * Note on API versions: Recall's transcript-retrieval shape has changed across
 * versions. fetchTranscriptText handles the two common shapes (the bot's
 * media_shortcuts transcript download URL, and the legacy /transcript endpoint);
 * if your account's version differs, that helper is the one spot to adjust.
 */
import crypto from "crypto";

function base(): string {
  return (process.env.RECALL_API_BASE || "https://us-west-2.recall.ai").replace(/\/+$/, "");
}

function apiKey(): string {
  return process.env.RECALL_API_KEY || "";
}

export function isRecallConfigured(): boolean {
  return !!apiKey();
}

async function recallFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base()}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

export type ScheduledBot = { id: string };

/**
 * Schedule a bot to join `meetingUrl` at `joinAtISO` and record + transcribe.
 * `metadata` is echoed back on webhooks so we can map the bot to its booking.
 * Returns null on any failure (caller records the failure but never fails the
 * booking over it).
 */
export async function scheduleBot(args: {
  meetingUrl: string;
  joinAtISO: string;
  botName: string;
  metadata: Record<string, string>;
}): Promise<ScheduledBot | null> {
  if (!isRecallConfigured()) return null;
  try {
    const res = await recallFetch("/bot/", {
      method: "POST",
      body: JSON.stringify({
        meeting_url: args.meetingUrl,
        bot_name: args.botName,
        join_at: args.joinAtISO,
        metadata: args.metadata,
        // Record the mixed A/V and produce an async transcript. Recall stores
        // the artifacts and exposes them on the bot once the call ends.
        recording_config: {
          transcript: { provider: { recallai_async: {} } },
        },
      }),
    });
    if (!res.ok) {
      console.error("[recall] scheduleBot", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { id?: string };
    return json.id ? { id: json.id } : null;
  } catch (err) {
    console.error("[recall] scheduleBot threw", err);
    return null;
  }
}

/** Raw bot record (status_changes, recordings, media_shortcuts, metadata). */
export async function getBot(botId: string): Promise<Record<string, unknown> | null> {
  if (!isRecallConfigured() || !botId) return null;
  try {
    const res = await recallFetch(`/bot/${encodeURIComponent(botId)}/`);
    if (!res.ok) { console.error("[recall] getBot", res.status); return null; }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) { console.error("[recall] getBot threw", err); return null; }
}

/** Best-effort: stop / remove a scheduled or in-call bot (on cancel). Never throws. */
export async function stopBot(botId: string): Promise<void> {
  if (!isRecallConfigured() || !botId) return;
  // leave_call handles an in-call bot; DELETE removes a still-scheduled one.
  try { await recallFetch(`/bot/${encodeURIComponent(botId)}/leave_call/`, { method: "POST" }); } catch { /* best-effort */ }
  try { await recallFetch(`/bot/${encodeURIComponent(botId)}/`, { method: "DELETE" }); } catch { /* best-effort */ }
}

/** Pull the terminal bot status from status_changes (e.g. "done", "fatal", "call_ended"). */
export function botStatusOf(bot: Record<string, unknown> | null): string {
  if (!bot) return "";
  const changes = (bot.status_changes as { code?: string }[] | undefined) || [];
  const last = changes[changes.length - 1];
  return (last?.code || (bot.status as string) || "").toString();
}

type ShortcutData = { data?: { download_url?: string } };
type Recording = { media_shortcuts?: { transcript?: ShortcutData; video_mixed?: ShortcutData } };

/** Best-effort recording (mixed video) download URL from the bot record. */
export function recordingUrlOf(bot: Record<string, unknown> | null): string | null {
  const recs = (bot?.recordings as Recording[] | undefined) || [];
  for (const r of recs) {
    const u = r?.media_shortcuts?.video_mixed?.data?.download_url;
    if (u) return u;
  }
  return null;
}

/**
 * Fetch and flatten the transcript to plain text. Handles two shapes:
 *  1) the bot's media_shortcuts.transcript download URL (JSON of segments), and
 *  2) the legacy GET /bot/{id}/transcript/ endpoint (array of segments).
 * Each segment is { participant?: {name}, words: [{text}] } or { speaker, words }.
 * Returns null if no transcript is available yet.
 */
export async function fetchTranscriptText(botId: string): Promise<string | null> {
  const bot = await getBot(botId);
  const recs = (bot?.recordings as Recording[] | undefined) || [];
  let segments: unknown[] | null = null;

  for (const r of recs) {
    const url = r?.media_shortcuts?.transcript?.data?.download_url;
    if (url) {
      try {
        const res = await fetch(url);
        if (res.ok) { segments = (await res.json()) as unknown[]; break; }
      } catch { /* try next / fallback */ }
    }
  }

  if (!segments) {
    try {
      const res = await recallFetch(`/bot/${encodeURIComponent(botId)}/transcript/`);
      if (res.ok) segments = (await res.json()) as unknown[];
    } catch { /* none */ }
  }

  if (!Array.isArray(segments) || segments.length === 0) return null;
  return flattenSegments(segments);
}

function flattenSegments(segments: unknown[]): string {
  const lines: string[] = [];
  for (const raw of segments) {
    const seg = raw as {
      participant?: { name?: string };
      speaker?: string;
      words?: ({ text?: string } | string)[];
      text?: string;
    };
    const who = seg.participant?.name || seg.speaker || "";
    let text = seg.text || "";
    if (!text && Array.isArray(seg.words)) {
      text = seg.words.map((w) => (typeof w === "string" ? w : w.text || "")).join(" ").replace(/\s+/g, " ").trim();
    }
    if (!text) continue;
    lines.push(who ? `${who}: ${text}` : text);
  }
  return lines.join("\n").trim() || "";
}

/**
 * Verify a Recall (Svix) webhook signature. Svix signs
 * `${svix-id}.${svix-timestamp}.${rawBody}` with HMAC-SHA256 using the secret
 * bytes (base64 after the "whsec_" prefix); the svix-signature header is a
 * space-separated list of `v1,<base64sig>`. Returns true if any matches.
 * If no secret is configured, returns true (verification disabled) but logs.
 */
export function verifyWebhook(rawBody: string, headers: Headers): boolean {
  const secret = process.env.RECALL_WEBHOOK_SECRET || "";
  if (!secret) { console.warn("[recall] RECALL_WEBHOOK_SECRET unset — webhook signature not verified"); return true; }
  const id = headers.get("svix-id") || headers.get("webhook-id") || "";
  const timestamp = headers.get("svix-timestamp") || headers.get("webhook-timestamp") || "";
  const sigHeader = headers.get("svix-signature") || headers.get("webhook-signature") || "";
  if (!id || !timestamp || !sigHeader) return false;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const provided = sigHeader.split(" ").map((p) => p.split(",")[1] || p);
  return provided.some((sig) => {
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
  });
}
