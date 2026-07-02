import { createAdminClient } from "./admin";

/**
 * Delivery log for incoming webhooks (webhook_events table). Mirrors
 * admin-audit.ts: best-effort, and it must be IMPOSSIBLE for this function to
 * throw - a logging failure (missing table on prod schema lag, RLS
 * misconfiguration, network blip) can never affect event processing. That
 * exact failure class has broken the Lemon Squeezy webhook in prod before.
 */

type InsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

/**
 * Returns a deep copy of the payload with license key material redacted.
 * license_key_created/updated deliveries carry the full key in
 * data.attributes.key / key_short; everything else in the payload is fine
 * for an admin-only table.
 */
function redactPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload ?? null;
  try {
    const copy = JSON.parse(JSON.stringify(payload)) as {
      data?: { attributes?: Record<string, unknown> };
    };
    const attrs = copy.data?.attributes;
    if (attrs && typeof attrs === "object") {
      if ("key" in attrs) attrs.key = "[redacted]";
      if ("key_short" in attrs) attrs.key_short = "[redacted]";
    }
    return copy;
  } catch {
    return null;
  }
}

export async function logWebhookEvent(params: {
  source?: string;
  eventName: string | null;
  recordId: string | null;
  userHint?: string | null;
  status: "processed" | "error" | "skipped";
  errorMessage?: string | null;
  durationMs?: number | null;
  payload?: unknown;
}): Promise<void> {
  try {
    const supabase = createAdminClient() as unknown as InsertClient | null;
    if (!supabase) return;
    const { error } = await supabase.from("webhook_events").insert({
      source: params.source ?? "lemonsqueezy",
      event_name: params.eventName,
      record_id: params.recordId,
      user_hint: params.userHint ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
      duration_ms: params.durationMs ?? null,
      payload: redactPayload(params.payload),
    });
    if (error) {
      console.error("logWebhookEvent: insert failed", error, {
        event: params.eventName,
        status: params.status,
      });
    }
  } catch (error) {
    console.error("logWebhookEvent threw", error, { event: params.eventName });
  }
}
