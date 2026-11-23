/**
 * GET /api/admin/support/customer?email=...   (support.view)
 *
 * Billing context for the person behind a ticket: their latest subscription
 * and, when they are on a comped (free) plan, which comp and how long it has
 * left. Best-effort: every lookup degrades to null so the ticket drawer never
 * blocks on billing data.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompForCustomer, type CompSummary } from "@/lib/comps-data";
import { getStatusBadge } from "@/lib/subscription-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Subscription = {
  status: string | null;
  plan_name: string | null;
  renews_at: string | null;
  ends_at: string | null;
  badge: { label: string; className: string };
};

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) return NextResponse.json({ error: "Bad email" }, { status: 400 });

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }
  let userId: string | null = null;
  let subscription: Subscription | null = null;
  if (admin) {
    const { data: prof } = await admin.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle();
    userId = (prof?.id as string | undefined) ?? null;
    if (userId) {
      const { data: sub } = await admin
        .from("subscriptions").select("status,plan_name,renews_at,ends_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (sub) {
        subscription = {
          status: sub.status ?? null, plan_name: sub.plan_name ?? null,
          renews_at: sub.renews_at ?? null, ends_at: sub.ends_at ?? null,
          badge: getStatusBadge(sub.status ?? null),
        };
      }
    }
  }

  let comp: CompSummary | null = null;
  try { comp = await loadCompForCustomer({ userId, email }); } catch { comp = null; }

  return NextResponse.json({ userId, subscription, comp });
}
