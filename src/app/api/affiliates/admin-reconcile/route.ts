import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin reconciliation feed. Answers "how will we ever know to link them up?"
 * by surfacing, in one place:
 *
 *  - stuck: IB users approved as affiliates (is_affiliate=true) whose
 *           profiles.ls_affiliate_id is still null. These earn $0 until linked.
 *  - lsAffiliates: every affiliate in our Lemon Squeezy store, with status and
 *           email, flagged with whether their email matches an IB account and
 *           whether they're already linked.
 *
 * An admin eyeballs the two lists, spots the email mismatch (dashboard
 * elizabethdean30 <-> LS thesocialmediaposse), and links them via
 * POST /api/affiliates/admin-link.
 */

type ReconcileResult<T> = Promise<{ data: T[] | null; error: unknown }>;

type ReconcileQuery = ReconcileResult<Record<string, unknown>> & {
  eq: (col: string, value: string | boolean) => ReconcileQuery;
};

type ReconcileClient = {
  from: (table: string) => {
    select: (cols: string) => ReconcileQuery;
  };
};

type LsAffiliateItem = {
  id?: string;
  attributes?: {
    status?: string;
    user_email?: string | null;
    user_name?: string | null;
  };
};

type StoreAffiliate = {
  id: string;
  email: string | null;
  name: string | null;
  status: string;
};

type CodeHealth = "ok" | "missing-code" | "missing-discount-id" | "discount-not-in-ls";

/**
 * Verifies a branded discount still exists in Lemon Squeezy. Branded-code
 * creation at approval is non-fatal (see affiliates-approve.ts), so a failed
 * POST /discounts leaves the affiliate with no working code and no error - this
 * is how we detect that silent failure after the fact.
 */
async function discountExistsInLs(discountId: string): Promise<boolean> {
  try {
    const res = await lsApi(`/discounts/${encodeURIComponent(discountId)}`);
    return res.ok;
  } catch (error) {
    console.error("admin-reconcile: discount existence check failed", discountId, error);
    // Treat a transient API error as "exists" so we don't false-flag healthy
    // codes; a genuinely missing discount returns a clean 404 (res.ok false).
    return true;
  }
}

async function listStoreAffiliates(storeId: string): Promise<StoreAffiliate[]> {
  const out: StoreAffiliate[] = [];
  const pageSize = 100;
  const maxPages = 10;
  for (let page = 1; page <= maxPages; page++) {
    const res = await lsApi(
      `/affiliates?filter[store_id]=${encodeURIComponent(storeId)}&page[size]=${pageSize}&page[number]=${page}`,
    );
    if (!res.ok) {
      console.error("admin-reconcile: LS affiliates list failed", res.status, "page", page);
      break;
    }
    const json = (await res.json()) as { data?: LsAffiliateItem[] };
    const items = Array.isArray(json.data) ? json.data : [];
    for (const item of items) {
      if (!item.id) continue;
      out.push({
        id: item.id,
        email: item.attributes?.user_email ?? null,
        name: item.attributes?.user_name ?? null,
        status: item.attributes?.status ?? "unknown",
      });
    }
    if (items.length < pageSize) break;
  }
  return out;
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    console.error("admin-reconcile: LEMONSQUEEZY_STORE_ID missing");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createAdminClient() as unknown as ReconcileClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    // Approved affiliates and their LS link state.
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id,email,affiliate_code,ls_affiliate_id,ls_affiliate_discount_id")
      .eq("is_affiliate", true);

    if (profilesErr) {
      console.error("admin-reconcile: profiles query failed", profilesErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    // Application metadata (names, applied dates) keyed by user_id.
    const { data: apps, error: appsErr } = await supabase
      .from("affiliate_applications")
      .select("user_id,full_name,email,created_at");

    if (appsErr) {
      console.error("admin-reconcile: applications query failed", appsErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const appByUser = new Map<string, { fullName: string | null; email: string | null; createdAt: string | null }>();
    for (const row of apps ?? []) {
      const userId = typeof row.user_id === "string" ? row.user_id : null;
      if (!userId) continue;
      appByUser.set(userId, {
        fullName: typeof row.full_name === "string" ? row.full_name : null,
        email: typeof row.email === "string" ? row.email : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
      });
    }

    // Index IB emails -> userId and linked LS ids for the matcher below.
    const emailToUserId = new Map<string, string>();
    const linkedLsIdToUserId = new Map<string, string>();
    const stuck: {
      userId: string;
      email: string | null;
      fullName: string | null;
      affiliateCode: string | null;
      appliedAt: string | null;
    }[] = [];

    for (const row of profiles ?? []) {
      const userId = typeof row.id === "string" ? row.id : null;
      if (!userId) continue;
      const profileEmail = typeof row.email === "string" ? row.email : null;
      const lsId =
        typeof row.ls_affiliate_id === "string" && row.ls_affiliate_id.length > 0
          ? row.ls_affiliate_id
          : null;
      const app = appByUser.get(userId);

      if (profileEmail) emailToUserId.set(profileEmail.toLowerCase(), userId);
      if (app?.email) emailToUserId.set(app.email.toLowerCase(), userId);
      if (lsId) linkedLsIdToUserId.set(lsId, userId);

      if (!lsId) {
        stuck.push({
          userId,
          email: profileEmail ?? app?.email ?? null,
          fullName: app?.fullName ?? null,
          affiliateCode:
            typeof row.affiliate_code === "string" ? row.affiliate_code : null,
          appliedAt: app?.createdAt ?? null,
        });
      }
    }

    stuck.sort((a, b) => {
      const at = a.appliedAt ?? "";
      const bt = b.appliedAt ?? "";
      return at < bt ? 1 : at > bt ? -1 : 0;
    });

    // LS store affiliates, flagged with match/link state.
    const storeAffiliates = await listStoreAffiliates(storeId);
    const lsAffiliates = storeAffiliates.map((a) => {
      const matchUserId = a.email
        ? emailToUserId.get(a.email.toLowerCase()) ?? null
        : null;
      return {
        id: a.id,
        email: a.email,
        name: a.name,
        status: a.status,
        linkedToUserId: linkedLsIdToUserId.get(a.id) ?? null,
        emailMatchesUserId: matchUserId,
      };
    });

    // Code-health pass: confirm each affiliate's branded code was actually
    // created in LS and the discount still exists. Catches the silent
    // non-fatal failure path in affiliates-approve.ts.
    const codeHealth = await Promise.all(
      (profiles ?? []).map(async (row) => {
        const userId = typeof row.id === "string" ? row.id : null;
        if (!userId) return null;
        const affiliateCode =
          typeof row.affiliate_code === "string" && row.affiliate_code.length > 0
            ? row.affiliate_code
            : null;
        const discountId =
          typeof row.ls_affiliate_discount_id === "string" &&
          row.ls_affiliate_discount_id.length > 0
            ? row.ls_affiliate_discount_id
            : null;

        let health: CodeHealth;
        if (!affiliateCode) {
          health = "missing-code";
        } else if (!discountId) {
          health = "missing-discount-id";
        } else if (!(await discountExistsInLs(discountId))) {
          health = "discount-not-in-ls";
        } else {
          health = "ok";
        }

        return {
          userId,
          email: typeof row.email === "string" ? row.email : null,
          fullName: appByUser.get(userId)?.fullName ?? null,
          affiliateCode,
          health,
        };
      }),
    );

    const unhealthyCodes = codeHealth.filter(
      (c): c is NonNullable<typeof c> => c !== null && c.health !== "ok",
    );

    return NextResponse.json({
      admin: { email: actor.email },
      stuck,
      lsAffiliates,
      unhealthyCodes,
    });
  } catch (error) {
    console.error("admin-reconcile failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
