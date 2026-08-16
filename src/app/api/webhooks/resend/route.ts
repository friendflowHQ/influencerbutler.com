/**
 * POST /api/webhooks/resend
 *
 * Receives Resend email events (delivered / opened / clicked / bounced /
 * complained / sent) and stamps them onto the matching email_sends row (by
 * resend_id). This is what turns the send log written by sendEmail()
 * (src/lib/email-send.ts) into open/click analytics for the admin Emails
 * dashboard.
 *
 * Newsletter broadcasts are sent server-side by Resend, so their recipients
 * have no email_sends row at send time; events for them carry a broadcast_id
 * and this handler inserts the row on the fly, which is what gives
 * per-recipient newsletter visibility.
 *
 * Hard bounces and spam complaints also feed the suppression list so future
 * marketing sends skip those addresses automatically.
 *
 * Resend signs webhooks with Svix. Unlike the Recall webhook, this endpoint
 * FAILS CLOSED when RESEND_WEBHOOK_SECRET is unset: it writes suppressions, so
 * an unauthenticated caller must not be able to reach the handler body.
 *
 * Setup: Resend dashboard -> Webhooks -> add endpoint for this URL with the
 * email.* events, then put the signing secret in RESEND_WEBHOOK_SECRET.
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSuppression } from "@/lib/email-unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a Svix signature (same scheme as src/lib/recall.ts): HMAC-SHA256 of
 * `${svix-id}.${svix-timestamp}.${rawBody}` with the secret bytes (base64
 * after the "whsec_" prefix); the signature header is a space-separated list
 * of `v1,<base64sig>` candidates.
 */
function verifySvix(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id") || headers.get("webhook-id") || "";
  const timestamp = headers.get("svix-timestamp") || headers.get("webhook-timestamp") || "";
  const sigHeader = headers.get("svix-signature") || headers.get("webhook-signature") || "";
  if (!id || !timestamp || !sigHeader) return false;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const provided = sigHeader.split(" ").map((p) => p.split(",")[1] || p);
  return provided.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    broadcast_id?: string;
    to?: string[] | string;
    subject?: string;
  };
};

const EVENT_COLUMN: Record<string, string> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
  "email.complained": "complained_at",
};

const HANDLED_TYPES = new Set(["email.sent", ...Object.keys(EVENT_COLUMN)]);

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  if (!secret) {
    console.error("resend webhook: RESEND_WEBHOOK_SECRET unset - rejecting");
    return NextResponse.json({ error: "Not configured" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifySvix(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const type = event.type ?? "";
  if (!HANDLED_TYPES.has(type)) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const data = event.data ?? {};
  const emailId = data.email_id;
  if (!emailId) {
    return NextResponse.json({ ok: true, ignored: "no-email-id" });
  }

  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to;
  const recipient = (toRaw ?? "").trim().toLowerCase();
  const ts = event.created_at ?? new Date().toISOString();
  const broadcastId = data.broadcast_id ?? null;

  // Everything below is best-effort: always answer 2xx so Svix stops retrying.
  // A dropped event only means a slightly stale dashboard.
  try {
    const db = createAdminClient();

    // Ensure a row exists for this Resend email. Normal sends already have one
    // (written by sendEmail); broadcast recipients and out-of-order events get
    // one inserted here. The partial unique index on resend_id absorbs races
    // with sendEmail's insert and Svix retries.
    const { data: existing } = await db
      .from("email_sends")
      .select("id")
      .eq("resend_id", emailId)
      .maybeSingle();
    if (!existing) {
      const { error: insertError } = await db.from("email_sends").insert({
        resend_id: emailId,
        broadcast_id: broadcastId,
        recipient,
        subject: data.subject ?? "",
        category: broadcastId ? "newsletter" : "unknown",
        funnel: broadcastId ? "newsletter" : "transactional",
        status: "sent",
      });
      // 23505 = unique violation: another writer won the race, which is fine.
      if (insertError && insertError.code !== "23505") {
        console.error("resend webhook: row insert failed", insertError);
      }
    }

    const column = EVENT_COLUMN[type];
    if (column) {
      // Only fill a null timestamp so retried/duplicated events cannot move
      // first-open / first-click.
      const { error: eventError } = await db
        .from("email_sends")
        .update({ [column]: ts, last_event_at: ts })
        .eq("resend_id", emailId)
        .is(column, null);
      if (eventError) console.error("resend webhook: event update failed", eventError);

      // Bump last_event_at even when the first-event column was already set.
      await db
        .from("email_sends")
        .update({ last_event_at: ts })
        .eq("resend_id", emailId);
    }

    if (recipient && (type === "email.bounced" || type === "email.complained")) {
      await recordSuppression(recipient, type === "email.bounced" ? "bounce" : "complaint");
    }
  } catch (err) {
    console.error("resend webhook: handler threw", err);
  }

  return NextResponse.json({ ok: true });
}
