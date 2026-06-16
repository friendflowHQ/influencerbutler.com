/**
 * POST /api/admin/catalogue-harvest/heartbeat
 *
 * Called by the InfluencerButler harvest-catalogue.yml workflow at the end of
 * each successful (or failed) harvest run. Persists the result to the
 * catalogue_harvest_status table so the in-dashboard admin panel and the
 * desktop staleness banner both consume the same source of truth.
 *
 * Auth: HMAC-SHA256 of the raw body using HARVEST_HEARTBEAT_TOKEN, sent as
 *   the X-Heartbeat-Signature header. Constant-time comparison.
 *
 * Body shape (from scripts/harvest/write-heartbeat.js in the desktop repo):
 *   {
 *     kind: "cc" | "spcc" | "deals",
 *     status: "ok" | "error",
 *     message?: string,
 *     durationMs?: number,
 *     version?: string | null,
 *     snapshotAt?: string | null,
 *     campaignCount?: number,
 *     reportedAt: string  // ISO
 *   }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HeartbeatBody = {
  kind?: string;
  status?: string;
  message?: string;
  durationMs?: number;
  version?: string | null;
  snapshotAt?: string | null;
  campaignCount?: number;
  reportedAt?: string;
};

type UpsertClient = {
  from: (table: string) => {
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

function verifySignature(rawBody: string, header: string | null, token: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", token).update(rawBody).digest("hex");
  if (expected.length !== header.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(header, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const token = process.env.HARVEST_HEARTBEAT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HARVEST_HEARTBEAT_TOKEN not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-heartbeat-signature");
  if (!verifySignature(rawBody, signature, token)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: HeartbeatBody;
  try {
    body = JSON.parse(rawBody) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
  }

  const kind =
    body.kind === "cc" || body.kind === "spcc" || body.kind === "deals" ? body.kind : null;
  if (!kind) {
    return NextResponse.json({ error: "kind must be 'cc', 'spcc', or 'deals'" }, { status: 400 });
  }
  const status = body.status === "ok" || body.status === "error" ? body.status : null;
  if (!status) {
    return NextResponse.json({ error: "status must be 'ok' or 'error'" }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as UpsertClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.from("catalogue_harvest_status").upsert(
    {
      kind,
      status,
      message: body.message ?? null,
      version: body.version ?? null,
      snapshot_at: body.snapshotAt ?? null,
      campaign_count: Number.isFinite(body.campaignCount) ? Number(body.campaignCount) : 0,
      duration_ms: Number.isFinite(body.durationMs) ? Number(body.durationMs) : 0,
      reported_at: body.reportedAt ?? new Date().toISOString(),
    },
    { onConflict: "kind" },
  );

  if (error) {
    console.error("catalogue-harvest heartbeat upsert failed", error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
