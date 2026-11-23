/**
 * /api/me/setup-snapshot
 *
 * POST { snapshot } - the desktop app reports which REQUIRED setup steps each
 *   butler has done (names only, no values). Auth: license key as a Bearer token
 *   (or a website session). The body is cleaned and bounded by sanitizeSnapshot,
 *   then stored one row per customer.
 * GET ?topics=a,b&type=support|demo - the booking page asks, for its picked
 *   topics, which checklist items the snapshot verifies or contradicts
 *   (src/lib/setup-snapshot.ts). Never returns the raw snapshot.
 *
 * See src/lib/setup-snapshot.ts for the why and the fail-open rules.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { getAdmin } from "@/lib/scheduling-server";
import { sanitizeTopics } from "@/lib/call-topics";
import { sanitizeSnapshot, setupVerifyEnabled, verifySetup } from "@/lib/setup-snapshot";
import { readSetupSnapshot, saveSetupSnapshot } from "@/lib/setup-snapshot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: { snapshot?: unknown };
  try { body = JSON.parse(text) as { snapshot?: unknown }; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const snapshot = sanitizeSnapshot(body?.snapshot);
  if (!snapshot) return NextResponse.json({ error: "Unusable snapshot" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const saved = await saveSetupSnapshot(admin, authed.auth.userId, snapshot);
  // The app treats a non-2xx as "try again next time", which is right while the table is not applied yet.
  if (!saved) return NextResponse.json({ error: "Could not save" }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });
  const url = new URL(request.url);
  const topics = sanitizeTopics((url.searchParams.get("topics") || "").split(","));
  const type = url.searchParams.get("type") === "demo" ? "demo" : "support";

  const admin = getAdmin();
  const stored = admin && setupVerifyEnabled() ? await readSetupSnapshot(admin, authed.auth.userId) : null;
  const verification = verifySetup({ topics, type, snapshot: stored?.snapshot ?? null, updatedAt: stored?.updatedAt ?? null });
  return NextResponse.json({ ok: true, ...verification });
}
