// GET /api/admin/billing/variants (read-only)
//
// Price lock setup check (Nov 30 2026). Lists every Lemon Squeezy variant in
// the store (price, interval, free trial, status) and, for each of the 14 level
// plans, the old-price variant we sell today and the new-price variant that is
// wired in for after the deadline (LEMONSQUEEZY_NEXT_VARIANT_<PLAN> /
// NEXT_VARIANT_IDS). For plans with no new-price id yet it suggests store
// variants whose price and interval already match the new price.
//
// Nothing is changed here: the LS API cannot create variants and this route
// only reads.
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { lsApi, NEXT_FAMILY_PLANS, nextVariantIdFor, resolveVariantId } from "@/lib/lemonsqueezy";
import { planMetaFor } from "@/lib/pricing-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LsList = {
  data?: { id: string; attributes?: Record<string, unknown> }[];
  meta?: { page?: { lastPage?: number } };
};

async function listAll(path: string): Promise<{ id: string; attributes: Record<string, unknown> }[]> {
  const out: { id: string; attributes: Record<string, unknown> }[] = [];
  for (let page = 1; page <= 20; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await lsApi(`${path}${sep}page[size]=100&page[number]=${page}`, { method: "GET" });
    if (!res.ok) throw new Error(`Lemon Squeezy ${path} returned ${res.status}`);
    const json = (await res.json()) as LsList;
    for (const d of json.data ?? []) out.push({ id: String(d.id), attributes: d.attributes ?? {} });
    const last = json.meta?.page?.lastPage ?? 1;
    if (page >= last) break;
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) return NextResponse.json({ error: "LEMONSQUEEZY_STORE_ID not set" }, { status: 500 });

  try {
    const products = await listAll(`/products?filter[store_id]=${encodeURIComponent(storeId)}`);
    const productName = new Map(products.map((p) => [p.id, str(p.attributes.name) ?? "?"]));
    const variants: {
      id: string;
      product: string;
      name: string | null;
      priceCents: number | null;
      interval: string | null;
      intervalCount: number | null;
      hasFreeTrial: boolean | null;
      trial: string | null;
      status: string | null;
    }[] = [];
    for (const p of products) {
      const vs = await listAll(`/variants?filter[product_id]=${encodeURIComponent(p.id)}`);
      for (const v of vs) {
        const a = v.attributes;
        variants.push({
          id: v.id,
          product: productName.get(String(a.product_id ?? p.id)) ?? "?",
          name: str(a.name),
          priceCents: num(a.price),
          interval: str(a.interval),
          intervalCount: num(a.interval_count),
          hasFreeTrial: typeof a.has_free_trial === "boolean" ? a.has_free_trial : null,
          trial: a.has_free_trial ? `${num(a.trial_interval_count) ?? "?"} ${str(a.trial_interval) ?? ""}`.trim() : null,
          status: str(a.status),
        });
      }
    }
    const byId = new Map(variants.map((v) => [v.id, v]));

    const plans = NEXT_FAMILY_PLANS.map((plan) => {
      const cur = resolveVariantId(plan, undefined);
      const currentId = cur.ok ? cur.variantId : null;
      const nextId = nextVariantIdFor(plan);
      const oldMeta = planMetaFor(plan, "current");
      const newMeta = planMetaFor(plan, "next");
      const interval = newMeta?.interval ?? null;
      const candidates = nextId
        ? []
        : variants
            .filter(
              (v) =>
                v.id !== currentId &&
                newMeta != null &&
                v.priceCents === newMeta.priceCents &&
                v.interval === interval &&
                (v.intervalCount ?? 1) === 1,
            )
            .map((v) => ({ id: v.id, product: v.product, name: v.name, status: v.status, hasFreeTrial: v.hasFreeTrial }));
      const curV = currentId ? byId.get(currentId) : undefined;
      const nextV = nextId ? byId.get(nextId) : undefined;
      return {
        plan,
        old: {
          id: currentId,
          expectedCents: oldMeta?.priceCents ?? null,
          lsCents: curV?.priceCents ?? null,
          status: curV?.status ?? null,
          hasFreeTrial: curV?.hasFreeTrial ?? null,
        },
        new: {
          id: nextId,
          expectedCents: newMeta?.priceCents ?? null,
          lsCents: nextV?.priceCents ?? null,
          status: nextV?.status ?? null,
          hasFreeTrial: nextV?.hasFreeTrial ?? null,
          candidates,
        },
      };
    });

    return NextResponse.json({ ok: true, plans, variants });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
