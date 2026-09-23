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

/**
 * True for a joinable Google Meet room URL (a recording bot can be sent into it),
 * whether we created the room on the owner's calendar or an admin hand-pasted the
 * link. Matches meet.google.com/<code>.
 */
export function isRecordableMeetingUrl(url: string | null | undefined): boolean {
  return !!url && /\bmeet\.google\.com\/[a-z0-9-]{3,}/i.test(url);
}

/**
 * Whether to schedule a recording bot for a booking/event. Yes when the provider
 * is a Google Meet we made, OR the join link is a joinable Meet room. This is the
 * key point: a hand-pasted meet.google.com link is stored with provider "manual"
 * (so cancel does not try to delete a calendar event we do not own), but it is
 * still a real room a bot can join, so it should record.
 */
export function shouldScheduleRecordingBot(
  provider: string | null | undefined,
  joinUrl: string | null | undefined,
): boolean {
  if (!joinUrl) return false;
  return provider === "google_meet" || isRecordableMeetingUrl(joinUrl);
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
        // Record the mixed A/V and transcribe with Recall's own engine. This
        // account's Recall API version does not accept the older recallai_async
        // provider (it 400s "Must provide exactly one of ... recallai_streaming
        // ..."); recallai_streaming is the Recall-native option that needs no
        // third-party transcription key and still produces the downloadable
        // transcript artifact fetchTranscriptText reads once the call ends.
        recording_config: {
          transcript: { provider: { recallai_streaming: {} } },
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

export type RecallHealth = {
  configured: boolean;
  apiBase: string;
  keyConfigured: boolean;
  keyLength: number;
  webhookSecretConfigured: boolean;
  probe: {
    ok: boolean;
    status: number | null;
    statusText: string;
    bodySnippet: string;
    error: string | null;
  };
  diagnosis: string;
};

/**
 * Owner diagnostic for the recording pipeline. Reports whether Recall is
 * configured and does one harmless live read (GET /bot/) to validate the API key
 * and region without scheduling anything. Never returns the key itself, only its
 * length, so it is safe to expose behind an admin gate. `apiBase` is the public
 * region origin, not a secret. `diagnosis` maps the probe result to a plain-
 * English cause + fix.
 */
export async function recallHealthCheck(): Promise<RecallHealth> {
  const key = apiKey();
  const b = base();
  const health: RecallHealth = {
    configured: !!key,
    apiBase: b,
    keyConfigured: !!key,
    keyLength: key.length,
    webhookSecretConfigured: !!process.env.RECALL_WEBHOOK_SECRET,
    probe: { ok: false, status: null, statusText: "", bodySnippet: "", error: null },
    diagnosis: "",
  };

  if (!key) {
    health.diagnosis =
      "RECALL_API_KEY is not set, so no recording bot is ever scheduled and calls end as skipped. Set it in the Vercel project env.";
    return health;
  }

  try {
    // GET /bot/ validates auth + region exactly like scheduleBot's request, with
    // no side effect. A joining bot is never created by a read.
    const res = await recallFetch("/bot/");
    health.probe.ok = res.ok;
    health.probe.status = res.status;
    health.probe.statusText = res.statusText;
    health.probe.bodySnippet = (await res.text().catch(() => "")).slice(0, 300);
    health.diagnosis = diagnoseProbe(res.status, b);
  } catch (err) {
    health.probe.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    health.diagnosis =
      `Could not reach Recall at ${b}. RECALL_API_BASE is likely wrong: it must be a region origin like https://us-west-2.recall.ai.`;
  }
  return health;
}

export type BotCreateProbe = {
  status: number | null;
  statusText: string;
  bodySnippet: string;
  error: string | null;
  createdBotId: string | null;
  cleanedUp: boolean;
  diagnosis: string;
};

/**
 * Deep probe: attempt a real POST /bot/ with a dummy Meet URL to surface the
 * exact reason scheduleBot fails, then clean the bot up. Auth is already proven
 * by the read probe, so a non-2xx here is a request-body / API-version problem
 * (the payload shape Recall accepts drifts across account API versions). If the
 * create unexpectedly succeeds, the throwaway bot is removed immediately so no
 * real recorder is left scheduled. Only run this on demand (it does write).
 */
export async function probeBotCreate(): Promise<BotCreateProbe> {
  const out: BotCreateProbe = {
    status: null, statusText: "", bodySnippet: "", error: null,
    createdBotId: null, cleanedUp: false, diagnosis: "",
  };
  if (!isRecallConfigured()) {
    out.diagnosis = "RECALL_API_KEY is not set.";
    return out;
  }
  try {
    const res = await recallFetch("/bot/", {
      method: "POST",
      body: JSON.stringify({
        meeting_url: "https://meet.google.com/aaa-bbbb-ccc",
        bot_name: "Influencer Butler Healthcheck",
        join_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        recording_config: { transcript: { provider: { recallai_streaming: {} } } },
      }),
    });
    out.status = res.status;
    out.statusText = res.statusText;
    const body = await res.text().catch(() => "");
    out.bodySnippet = body.slice(0, 600);
    if (res.ok) {
      try {
        const j = JSON.parse(body) as { id?: string };
        if (j.id) { out.createdBotId = j.id; await stopBot(j.id); out.cleanedUp = true; }
      } catch { /* body was not the expected shape */ }
      out.diagnosis = "POST /bot/ succeeded, so the payload scheduleBot sends is accepted. The throwaway bot was cleaned up. If real bookings still fail, the difference is the meeting URL or join_at value, not the request shape.";
    } else if (out.status === 400) {
      out.diagnosis = "Recall rejected the bot-creation payload (HTTP 400). The request body shape does not match this account's Recall API version. The body snippet names the offending field: adjust scheduleBot's request in src/lib/recall.ts to match (commonly the recording_config / transcript block).";
    } else {
      out.diagnosis = `POST /bot/ returned HTTP ${out.status}. See the body snippet.`;
    }
  } catch (err) {
    out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    out.diagnosis = "The create request threw before a response. See error.";
  }
  return out;
}

function diagnoseProbe(status: number, b: string): string {
  if (status >= 200 && status < 300) {
    return "Recall API key and region are valid. New bookings with a Google Meet room should schedule a recording bot.";
  }
  if (status === 401 || status === 403) {
    return `Recall rejected the API key (HTTP ${status}). Either the key is invalid/expired, or RECALL_API_BASE (${b}) is the wrong region for this key. Recall keys are region-scoped: the base origin must match the region the key was issued in.`;
  }
  if (status === 404) {
    return `Recall returned 404 for the bot endpoint. RECALL_API_BASE (${b}) is likely the wrong origin.`;
  }
  return `Recall returned HTTP ${status}. See the response snippet for detail.`;
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
