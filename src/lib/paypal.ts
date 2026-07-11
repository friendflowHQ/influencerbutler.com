/**
 * Minimal PayPal REST client for the affiliate Payouts integration.
 *
 * Env:
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
 *   PAYPAL_BASE_URL           https://api-m.sandbox.paypal.com (sandbox) or
 *                             https://api-m.paypal.com (live)
 *   PAYPAL_PAYOUTS_WEBHOOK_ID the webhook id, for signature verification
 *
 * We hand-roll fetch (no SDK) to match how the rest of this codebase talks to
 * Lemon Squeezy. Money-movement calls live behind src/lib/paypal-payouts.ts and
 * the admin-disburse route, which enforce idempotency and preconditions.
 */

function baseUrl(): string {
  return process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

// In-memory access-token cache (per warm serverless instance).
let cachedToken: { token: string; expiresAtMs: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error("PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  }

  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal token request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("PayPal token response missing access_token");
  }
  const ttlMs = (typeof json.expires_in === "number" ? json.expires_in : 300) * 1000;
  cachedToken = { token: json.access_token, expiresAtMs: now + ttlMs };
  return json.access_token;
}

/** cents -> PayPal "12.34" string (2 decimals). */
export function centsToAmount(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export type PayoutItemInput = {
  receiver: string; // PayPal email
  amountCents: number;
  currency: string;
  senderItemId: string;
  note?: string;
};

export type CreatePayoutResult =
  | { ok: true; payoutBatchId: string; batchStatus: string | null }
  | { ok: false; status: number; error: string; alreadyExists?: boolean };

/**
 * POST /v1/payments/payouts. senderBatchId MUST be persisted before this call
 * (idempotency): PayPal rejects a duplicate sender_batch_id, which is our second
 * line of defense against double-paying (the UNIQUE column is the first).
 */
export async function createPayoutBatch(params: {
  senderBatchId: string;
  emailSubject: string;
  items: PayoutItemInput[];
}): Promise<CreatePayoutResult> {
  const token = await getAccessToken();
  const body = {
    sender_batch_header: {
      sender_batch_id: params.senderBatchId,
      email_subject: params.emailSubject,
    },
    items: params.items.map((it) => ({
      recipient_type: "EMAIL" as const,
      receiver: it.receiver,
      amount: { value: centsToAmount(it.amountCents), currency: it.currency },
      sender_item_id: it.senderItemId,
      note: it.note ?? "Affiliate commission",
    })),
  };

  const res = await fetch(`${baseUrl()}/v1/payments/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    // 400 DUPLICATE_SENDER_BATCH_ID means an identical batch already exists.
    const alreadyExists = raw.includes("DUPLICATE_SENDER_BATCH_ID");
    return { ok: false, status: res.status, error: raw.slice(0, 400), alreadyExists };
  }

  const json = JSON.parse(raw) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
  const payoutBatchId = json.batch_header?.payout_batch_id;
  if (!payoutBatchId) {
    return { ok: false, status: 502, error: "PayPal response missing payout_batch_id" };
  }
  return { ok: true, payoutBatchId, batchStatus: json.batch_header?.batch_status ?? null };
}

export type PayoutBatchItem = {
  payoutItemId: string | null;
  senderItemId: string | null;
  transactionStatus: string | null; // SUCCESS | FAILED | UNCLAIMED | RETURNED | ...
};

export type GetPayoutResult =
  | { ok: true; batchStatus: string | null; items: PayoutBatchItem[] }
  | { ok: false; status: number; error: string };

/** GET /v1/payments/payouts/{batchId} for polling terminal status. */
export async function getPayoutBatch(payoutBatchId: string): Promise<GetPayoutResult> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: raw.slice(0, 400) };
  }
  const json = JSON.parse(raw) as {
    batch_header?: { batch_status?: string };
    items?: Array<{
      payout_item_id?: string;
      transaction_status?: string;
      payout_item?: { sender_item_id?: string };
    }>;
  };
  const items: PayoutBatchItem[] = (json.items ?? []).map((it) => ({
    payoutItemId: it.payout_item_id ?? null,
    senderItemId: it.payout_item?.sender_item_id ?? null,
    transactionStatus: it.transaction_status ?? null,
  }));
  return { ok: true, batchStatus: json.batch_header?.batch_status ?? null, items };
}

export type WebhookHeaders = {
  transmissionId: string | null;
  transmissionTime: string | null;
  transmissionSig: string | null;
  certUrl: string | null;
  authAlgo: string | null;
};

/**
 * POST /v1/notifications/verify-webhook-signature. Returns true only when
 * PayPal confirms the signature. Fails closed on any error.
 */
export async function verifyWebhookSignature(
  headers: WebhookHeaders,
  eventBody: unknown,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_PAYOUTS_WEBHOOK_ID;
  if (!webhookId) {
    console.error("verifyWebhookSignature: PAYPAL_PAYOUTS_WEBHOOK_ID not set");
    return false;
  }
  if (
    !headers.transmissionId ||
    !headers.transmissionTime ||
    !headers.transmissionSig ||
    !headers.certUrl ||
    !headers.authAlgo
  ) {
    return false;
  }
  try {
    const token = await getAccessToken();
    const res = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: eventBody,
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
  } catch (err) {
    console.error("verifyWebhookSignature threw", err);
    return false;
  }
}
