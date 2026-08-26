/**
 * GET/POST /api/affiliates/admin-autopay-config
 *
 * Reads/sets the affiliate auto-pay "armed" flag from the admin dashboard, so the
 * owner can turn monthly PayPal auto-pay on/off without editing Vercel env vars.
 * The flag lives in app_config (key affiliate_autopay_armed); the autopay cron
 * reads it (OR the AFFILIATE_AUTOPAY_ENABLED env override). Shadow when off.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "affiliate_autopay_armed";

type ConfigClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

function capCents(): number {
  const raw = Number(process.env.AFFILIATE_AUTOPAY_CAP_CENTS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20000;
}

async function readArmed(db: ConfigClient): Promise<boolean> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", KEY).maybeSingle();
    const v = (data?.value ?? null) as { armed?: boolean } | null;
    return v?.armed === true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Env var forces armed on regardless of the toggle; surface that so the UI can
  // explain why the switch is locked.
  const envForced = process.env.AFFILIATE_AUTOPAY_ENABLED === "true";
  const dbArmed = await readArmed(db);
  return NextResponse.json({ armed: envForced || dbArmed, envForced, capCents: capCents() });
}

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.payout", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { armed?: unknown };
  try {
    body = (await request.json()) as { armed?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const armed = body.armed === true;

  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const nowIso = new Date().toISOString();
  const { error } = await db.from("app_config").upsert(
    {
      key: KEY,
      value: { armed, updated_by: actor.email ?? null },
      updated_at: nowIso,
      updated_by: actor.email ?? "admin",
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("admin-autopay-config: upsert failed", error);
    return NextResponse.json({ error: "Could not save the setting." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "affiliate.autopay.toggle",
    targetType: "system",
    targetId: KEY,
    details: { armed },
  });

  const envForced = process.env.AFFILIATE_AUTOPAY_ENABLED === "true";
  return NextResponse.json({ ok: true, armed: envForced || armed, envForced });
}
