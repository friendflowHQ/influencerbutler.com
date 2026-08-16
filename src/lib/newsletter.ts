// Newsletter scheduler data layer.
//
// State lives in app_config under 'newsletter_schedule':
//   { enabled, lastSentIndex, lastSentAt }
// The weekly cron (/api/cron/newsletter) sends the next unsent issue from
// NEWSLETTER_ISSUES to the Resend Audience (RESEND_AUDIENCE_ID) via a Resend
// Broadcast, then advances lastSentIndex. Sending is gated on RESEND_AUDIENCE_ID
// being set, so nothing goes out until the owner deliberately wires that up.
//
// All writes/sends are best-effort and never throw.

import { createServerClient } from "@supabase/ssr";
import { NEWSLETTER_ISSUES, type NewsletterIssue } from "@/lib/newsletter-issues";

const CONFIG_KEY = "newsletter_schedule";
const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";

export type NewsletterBroadcastRecord = {
  index: number;
  id: string; // Resend broadcast id; email_sends rows carry it as broadcast_id
  subject: string;
  sentAt: string;
};

export type NewsletterState = {
  enabled: boolean;
  lastSentIndex: number; // -1 means nothing sent yet
  lastSentAt: string | null;
  broadcasts: NewsletterBroadcastRecord[];
};

const DEFAULT_STATE: NewsletterState = {
  enabled: true,
  lastSentIndex: -1,
  lastSentAt: null,
  broadcasts: [],
};

type ServiceDb = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

function serviceDb(): ServiceDb | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  }) as unknown as ServiceDb;
}

export async function readNewsletterState(): Promise<NewsletterState> {
  try {
    const db = serviceDb();
    if (!db) return DEFAULT_STATE;
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_STATE;
    const v = (data.value && typeof data.value === "object" ? data.value : {}) as Record<
      string,
      unknown
    >;
    const idx = Number(v.last_sent_index);
    const rawBroadcasts = Array.isArray(v.broadcasts) ? v.broadcasts : [];
    const broadcasts: NewsletterBroadcastRecord[] = [];
    for (const raw of rawBroadcasts) {
      const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      if (typeof b.id !== "string" || !b.id) continue;
      broadcasts.push({
        index: Number.isFinite(Number(b.index)) ? Number(b.index) : -1,
        id: b.id,
        subject: typeof b.subject === "string" ? b.subject : "",
        sentAt: typeof b.sent_at === "string" ? b.sent_at : "",
      });
    }
    return {
      enabled: v.enabled !== false,
      lastSentIndex: Number.isFinite(idx) ? idx : -1,
      lastSentAt: typeof v.last_sent_at === "string" ? v.last_sent_at : null,
      broadcasts,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function writeNewsletterState(next: NewsletterState): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const { error } = await db.from("app_config").upsert(
    {
      key: CONFIG_KEY,
      value: {
        enabled: next.enabled,
        last_sent_index: next.lastSentIndex,
        last_sent_at: next.lastSentAt,
        broadcasts: next.broadcasts.map((b) => ({
          index: b.index,
          id: b.id,
          subject: b.subject,
          sent_at: b.sentAt,
        })),
      },
      updated_at: new Date().toISOString(),
      updated_by: "cron:newsletter",
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("writeNewsletterState: upsert failed", error);
    return false;
  }
  return true;
}

/** Wraps a plain-text body into simple, email-safe HTML. */
export function bodyToHtml(body: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#111827;max-width:560px;">${paragraphs}</div>`;
}

/**
 * Creates and immediately sends a Resend Broadcast for one issue to the
 * configured audience. Returns the broadcast id on success (so per-recipient
 * email_sends rows inserted by the Resend webhook can be tied back to the
 * issue), ok=false on any failure. Never throws.
 */
export async function sendNewsletterBroadcast(
  issue: NewsletterIssue,
): Promise<{ ok: boolean; broadcastId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  // RESEND_AUDIENCE_ID holds a Resend *segment* id. Resend renamed Audiences to
  // Segments, and the Broadcasts API now targets a segment_id. The env var keeps
  // its historical name so it does not need to be re-added in Vercel.
  const segmentId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !segmentId) return { ok: false, broadcastId: null };

  // Resend requires an unsubscribe link in broadcasts; the {{{RESEND_UNSUBSCRIBE_URL}}}
  // placeholder is replaced per-recipient and handles unsubscribes automatically.
  const unsubHtml =
    '<p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">' +
    '<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#9ca3af;">Unsubscribe</a></p>';
  const html = bodyToHtml(issue.body) + unsubHtml;
  const text = `${issue.body}\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`;

  try {
    const createRes = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        segment_id: segmentId,
        from: FROM_ADDRESS,
        reply_to: "hello@influencerbutler.com",
        subject: issue.subject,
        name: issue.subject,
        html,
        text,
      }),
    });
    if (!createRes.ok) {
      console.error("newsletter: broadcast create failed", createRes.status);
      return { ok: false, broadcastId: null };
    }
    const created = (await createRes.json()) as { id?: string; data?: { id?: string } };
    const broadcastId = created.id ?? created.data?.id;
    if (!broadcastId) {
      console.error("newsletter: broadcast create returned no id");
      return { ok: false, broadcastId: null };
    }

    const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcastId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!sendRes.ok) {
      console.error("newsletter: broadcast send failed", sendRes.status);
      return { ok: false, broadcastId: null };
    }
    return { ok: true, broadcastId };
  } catch (err) {
    console.error("newsletter: sendNewsletterBroadcast threw", err);
    return { ok: false, broadcastId: null };
  }
}

/** Index of the next issue to send, or null if the series is complete. */
export function nextIssueIndex(state: NewsletterState): number | null {
  const next = state.lastSentIndex + 1;
  if (next >= NEWSLETTER_ISSUES.length) return null;
  return next;
}

export { NEWSLETTER_ISSUES };
