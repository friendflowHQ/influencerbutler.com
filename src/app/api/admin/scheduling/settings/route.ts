/**
 * GET  /api/admin/scheduling/settings  -> { config, rules, blocks }
 * POST /api/admin/scheduling/settings  -> mutate config / rules / blocks
 *   Body: { action:'config'|'addRule'|'deleteRule'|'addBlock'|'deleteBlock', ... }
 * Gated by scheduling.view (GET) / scheduling.manage (POST). Audited.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin } from "@/lib/scheduling-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("scheduling.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const [config, rules, blocks] = await Promise.all([
    admin.from("call_config").select("*").eq("id", 1).maybeSingle(),
    admin.from("call_availability_rules").select("*").order("timezone").order("weekday"),
    admin.from("call_blocks").select("*").gte("ends_at", new Date().toISOString()).order("starts_at").limit(200),
  ]);
  return NextResponse.json({ config: config.data ?? null, rules: rules.data ?? [], blocks: blocks.data ?? [] });
}

type Body = {
  action?: string;
  config?: Partial<{ booking_horizon_days: number; lead_time_hours: number; decoy_min_per_day: number; decoy_max_per_day: number; default_join_url: string }>;
  rule?: { weekday: number; start_min: number; end_min: number; timezone: string; effective_from?: string | null; effective_to?: string | null };
  block?: { starts_at: string; ends_at: string; label?: string };
  id?: string;
};

export async function POST(request: Request) {
  const actor = await requirePermission("scheduling.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    switch (body.action) {
      case "config": {
        const c = body.config || {};
        await admin.from("call_config").update({ ...c, updated_at: new Date().toISOString() }).eq("id", 1);
        break;
      }
      case "addRule": {
        if (!body.rule) return NextResponse.json({ error: "Missing rule" }, { status: 400 });
        await admin.from("call_availability_rules").insert(body.rule);
        break;
      }
      case "deleteRule": {
        if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
        await admin.from("call_availability_rules").delete().eq("id", body.id);
        break;
      }
      case "addBlock": {
        if (!body.block) return NextResponse.json({ error: "Missing block" }, { status: 400 });
        await admin.from("call_blocks").insert(body.block);
        break;
      }
      case "deleteBlock": {
        if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
        await admin.from("call_blocks").delete().eq("id", body.id);
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[scheduling/settings] mutate", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await logAdminAction({ actor, action: `scheduling.settings.${body.action}`, targetType: "call_config", targetId: body.id ?? null, details: (body.config || body.rule || body.block || {}) as Record<string, unknown> });
  return NextResponse.json({ ok: true });
}
