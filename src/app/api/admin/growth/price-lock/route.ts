/**
 * GET /api/admin/growth/price-lock
 *
 * "Price lock push" card on the Growth page: results since Thu Nov 12 2026
 * (Pacific midnight). Trial starts, trials converted, comps that added a card,
 * cancelled customers who came back, new MRR against the $1,000 goal, and per
 * cold group (E1 / E2 / E3): emails sent, people who clicked, trials started,
 * people who paid. Counts only, no personal data.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { planMetaForVariantId } from "@/lib/lemonsqueezy";
import { PRICE_LOCK_PUSH_START } from "@/lib/price-lock";
import { COLD_SEGMENT_TAG } from "@/lib/price-lock-audience";
import { campaignCategory } from "@/lib/email-marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;
const NEW_MRR_GOAL_CENTS = 100_000;

type Sub = {
  user_id: string | null;
  ls_subscription_id: string | null;
  ls_variant_id: string | number | null;
  status: string | null;
  created_at: string | null;
  trial_ends_at?: string | null;
};
type Order = { user_id: string | null; ls_subscription_id: string | null; total: number | null; created_at: string | null };

async function pageAll<T>(run: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error("read failed");
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadSubs(db: SupabaseClient): Promise<Sub[]> {
  try {
    return await pageAll<Sub>((a, b) =>
      db
        .from("subscriptions")
        .select("user_id, ls_subscription_id, ls_variant_id, status, created_at, trial_ends_at")
        .order("ls_subscription_id")
        .range(a, b),
    );
  } catch {
    // trial_ends_at may not exist in prod: fall back without it.
    return pageAll<Sub>((a, b) =>
      db.from("subscriptions").select("user_id, ls_subscription_id, ls_variant_id, status, created_at").order("ls_subscription_id").range(a, b),
    );
  }
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const since = PRICE_LOCK_PUSH_START;
  const sinceMs = Date.parse(since);

  try {
    const [subs, orders, grants, profiles] = await Promise.all([
      loadSubs(db),
      pageAll<Order>((a, b) =>
        db.from("orders").select("user_id, ls_subscription_id, total, created_at").eq("status", "paid").gt("total", 0).order("created_at").range(a, b),
      ),
      pageAll<{ user_id: string | null; ls_subscription_id: string | null; kind?: string | null; issued_at?: string | null; converted_at?: string | null }>(
        (a, b) => db.from("comp_grants").select("*").order("ls_subscription_id").range(a, b),
      ),
      pageAll<{ id: string; email: string | null }>((a, b) => db.from("profiles").select("id, email").order("id").range(a, b)),
    ]);

    const compIds = new Set(grants.map((g) => g.ls_subscription_id).filter((x): x is string => !!x));
    const isComp = (s: Sub) => !s.ls_subscription_id || s.ls_subscription_id.startsWith("comp:") || compIds.has(s.ls_subscription_id);
    const paidSubs = new Set<string>();
    const paidBefore = new Set<string>(); // users who paid before the push
    const paidSince = new Set<string>(); // users who paid since the push
    for (const o of orders) {
      if (o.ls_subscription_id) paidSubs.add(o.ls_subscription_id);
      if (!o.user_id || !o.created_at) continue;
      if (Date.parse(o.created_at) < sinceMs) paidBefore.add(o.user_id);
      else paidSince.add(o.user_id);
    }

    const newSubs = subs.filter((s) => !isComp(s) && s.created_at && Date.parse(s.created_at) >= sinceMs);
    const trialSubs = newSubs.filter((s) => s.trial_ends_at || s.status === "on_trial");
    const noCardTrials = grants.filter((g) => g.kind === "trial" && g.issued_at && Date.parse(g.issued_at) >= sinceMs);
    const trialsConverted = trialSubs.filter((s) => s.ls_subscription_id && paidSubs.has(s.ls_subscription_id) && s.status !== "on_trial");
    const compsAddedCard = grants.filter((g) => g.kind !== "trial" && g.converted_at && Date.parse(g.converted_at) >= sinceMs);
    const returned = new Set(
      newSubs.filter((s) => s.user_id && paidBefore.has(s.user_id)).map((s) => s.user_id as string),
    );

    // New MRR: monthly value of subscriptions started since the push that are
    // paying now (trials count once they convert).
    let newMrrCents = 0;
    let pendingTrialMrrCents = 0;
    for (const s of newSubs) {
      const meta = planMetaForVariantId(s.ls_variant_id == null ? null : String(s.ls_variant_id));
      if (!meta) continue;
      const monthly = meta.interval === "year" ? meta.priceCents / 12 : meta.priceCents;
      const live = s.status === "active" || s.status === "past_due";
      if (live && s.ls_subscription_id && paidSubs.has(s.ls_subscription_id)) newMrrCents += monthly;
      else if (s.status === "on_trial") pendingTrialMrrCents += monthly;
    }

    // Cold groups: members are the pl-e* tagged contacts.
    const emailOfUser = new Map(profiles.map((p) => [p.id, (p.email ?? "").trim().toLowerCase()]));
    const trialEmails = new Set(
      [...trialSubs.map((s) => s.user_id), ...noCardTrials.map((g) => g.user_id)]
        .map((id) => (id ? emailOfUser.get(id) : undefined))
        .filter((e): e is string => !!e),
    );
    const paidEmails = new Set([...paidSince].map((id) => emailOfUser.get(id)).filter((e): e is string => !!e));

    const { data: pushCampaigns } = await db.from("email_campaigns").select("id, name").like("name", "Price lock: %");
    const categoryOfGroup: Record<string, string[]> = { E1: [], E2: [], E3: [] };
    for (const c of (pushCampaigns ?? []) as { id: string; name: string }[]) {
      const m = /^Price lock: pl-(e[123])-/.exec(c.name);
      if (m) categoryOfGroup[m[1].toUpperCase()].push(campaignCategory(c.id));
    }

    const cold: Record<string, { members: number; sent: number; clicked: number; trials: number; paid: number }> = {};
    for (const group of ["E1", "E2", "E3"] as const) {
      const members = (
        await pageAll<{ email: string }>((a, b) =>
          db.from("email_subscribers").select("email").contains("tags", [COLD_SEGMENT_TAG[group]]).order("email").range(a, b),
        )
      ).map((r) => r.email.trim().toLowerCase());
      let sent = 0;
      const clickers = new Set<string>();
      for (const category of categoryOfGroup[group]) {
        const rows = await pageAll<{ recipient: string; clicked_at: string | null }>((a, b) =>
          db
            .from("email_sends")
            .select("recipient, clicked_at")
            .eq("category", category)
            .eq("status", "sent")
            .order("created_at", { ascending: false })
            .range(a, b),
        );
        sent += rows.length;
        for (const r of rows) if (r.clicked_at) clickers.add(r.recipient);
      }
      cold[group] = {
        members: members.length,
        sent,
        clicked: clickers.size,
        trials: members.filter((e) => trialEmails.has(e)).length,
        paid: members.filter((e) => paidEmails.has(e)).length,
      };
    }

    return NextResponse.json({
      since,
      trialStarts: trialSubs.length + noCardTrials.length,
      cardTrialStarts: trialSubs.length,
      noCardTrialStarts: noCardTrials.length,
      trialsConverted: trialsConverted.length,
      compsAddedCard: compsAddedCard.length,
      returnedCustomers: returned.size,
      newMrrCents: Math.round(newMrrCents),
      pendingTrialMrrCents: Math.round(pendingTrialMrrCents),
      goalCents: NEW_MRR_GOAL_CENTS,
      cold,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
