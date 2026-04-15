import { lsApi } from "@/lib/lemonsqueezy";

export type AffiliateApplication = {
  status: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
};

export type AffiliateSummary = {
  status: string;
  shareDomain: string | null;
  totalEarningsCents: number;
  unpaidEarningsCents: number;
  productsCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  userEmail: string | null;
};

export type AffiliatePortalState =
  | { state: "none"; application: null }
  | { state: "pending"; application: AffiliateApplication | null }
  | {
      state: "active";
      affiliate: AffiliateSummary;
      referrals: AffiliateReferralStats | null;
      lsAffiliateId: string;
    }
  | {
      state: "disabled";
      affiliate: AffiliateSummary;
      referrals: AffiliateReferralStats | null;
      lsAffiliateId: string;
    }
  | { state: "error"; message: string };

export type AffiliateDailyEarning = {
  date: string; // ISO date, YYYY-MM-DD
  earningsCents: number;
};

export type AffiliateReferralStats = {
  totalReferrals: number;
  activeReferrals: number;
  cancelledReferrals: number;
  conversionRate: number | null; // 0..1 or null when clicks unknown
  totalClicks: number | null;
  dailyEarnings: AffiliateDailyEarning[]; // last 90 days, oldest→newest
};

type LsAffiliateAttributes = {
  status?: string;
  share_domain?: string | null;
  total_earnings?: number;
  unpaid_earnings?: number;
  products?: unknown;
  created_at?: string;
  updated_at?: string;
  user_email?: string | null;
};

function countProducts(products: unknown): number {
  if (Array.isArray(products)) return products.length;
  if (products && typeof products === "object") return Object.keys(products).length;
  return 0;
}

export async function fetchLsAffiliate(lsAffiliateId: string): Promise<AffiliateSummary | null> {
  try {
    const response = await lsApi(`/affiliates/${encodeURIComponent(lsAffiliateId)}`);
    if (!response.ok) {
      console.error("LS affiliate fetch failed", response.status);
      return null;
    }
    const payload = (await response.json()) as {
      data?: { attributes?: LsAffiliateAttributes };
    };
    const attrs = payload.data?.attributes;
    if (!attrs) return null;

    return {
      status: attrs.status ?? "pending",
      shareDomain: attrs.share_domain ?? null,
      totalEarningsCents: Number(attrs.total_earnings ?? 0),
      unpaidEarningsCents: Number(attrs.unpaid_earnings ?? 0),
      productsCount: countProducts(attrs.products),
      createdAt: attrs.created_at ?? null,
      updatedAt: attrs.updated_at ?? null,
      userEmail: attrs.user_email ?? null,
    };
  } catch (error) {
    console.error("LS affiliate fetch threw", error);
    return null;
  }
}

export function formatUsdFromCents(cents: number): string {
  const dollars = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

type LsReferralAttributes = {
  created_at?: string;
  status?: string;
  commission_amount?: number; // cents
  amount?: number;
  subtotal?: number;
  cancelled_at?: string | null;
  refunded_at?: string | null;
  is_refunded?: boolean;
};

type LsIncluded = {
  type?: string;
  attributes?: LsReferralAttributes;
};

type LsAffiliateWithIncluded = {
  data?: { attributes?: LsAffiliateAttributes & { clicks?: number } };
  included?: LsIncluded[];
};

function isCancelledStatus(status: string | undefined, attrs: LsReferralAttributes): boolean {
  if (attrs.cancelled_at) return true;
  if (attrs.refunded_at) return true;
  if (attrs.is_refunded) return true;
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "cancelled" || s === "canceled" || s === "refunded" || s === "expired";
}

function toIsoDate(ts: string | undefined): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function buildDailyEarnings(
  referrals: LsIncluded[],
  days: number = 90,
): AffiliateDailyEarning[] {
  const bucket = new Map<string, number>();
  // Seed with zeros for each of the last `days` days so the sparkline has a
  // continuous axis even on quiet days.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    bucket.set(d.toISOString().slice(0, 10), 0);
  }

  for (const inc of referrals) {
    const attrs = inc.attributes ?? {};
    const dateKey = toIsoDate(attrs.created_at ?? undefined);
    if (!dateKey || !bucket.has(dateKey)) continue;
    const cents = Number(attrs.commission_amount ?? 0);
    if (Number.isFinite(cents) && cents > 0) {
      bucket.set(dateKey, (bucket.get(dateKey) ?? 0) + cents);
    }
  }

  return Array.from(bucket.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, earningsCents]) => ({ date, earningsCents }));
}

export async function fetchLsAffiliateReferrals(
  lsAffiliateId: string,
): Promise<AffiliateReferralStats | null> {
  try {
    const response = await lsApi(
      `/affiliates/${encodeURIComponent(lsAffiliateId)}?include=affiliate-referrals`,
    );
    if (!response.ok) {
      console.error("LS affiliate referrals fetch failed", response.status);
      return null;
    }
    const payload = (await response.json()) as LsAffiliateWithIncluded;
    const included = Array.isArray(payload.included) ? payload.included : [];
    const referrals = included.filter((item) => {
      if (!item.type) return false;
      const t = item.type.toLowerCase();
      return t === "affiliate-referrals" || t === "referrals";
    });

    let totalReferrals = 0;
    let cancelledReferrals = 0;
    for (const ref of referrals) {
      totalReferrals += 1;
      if (isCancelledStatus(ref.attributes?.status, ref.attributes ?? {})) {
        cancelledReferrals += 1;
      }
    }
    const activeReferrals = Math.max(0, totalReferrals - cancelledReferrals);

    const clicksRaw = payload.data?.attributes?.clicks;
    const totalClicks = typeof clicksRaw === "number" && Number.isFinite(clicksRaw) ? clicksRaw : null;
    const conversionRate =
      totalClicks && totalClicks > 0 ? totalReferrals / totalClicks : null;

    return {
      totalReferrals,
      activeReferrals,
      cancelledReferrals,
      conversionRate,
      totalClicks,
      dailyEarnings: buildDailyEarnings(referrals, 90),
    };
  } catch (error) {
    console.error("LS affiliate referrals fetch threw", error);
    return null;
  }
}

export function buildShareLink(shareDomain: string | null, lsAffiliateId: string): string {
  if (!shareDomain) {
    return `https://influencerbutler.com/?aff=${encodeURIComponent(lsAffiliateId)}`;
  }
  const normalized = shareDomain.startsWith("http") ? shareDomain : `https://${shareDomain}`;
  try {
    const url = new URL(normalized);
    // If LS already encoded an affiliate reference in the path, return as-is.
    if (url.pathname && url.pathname !== "/") return url.toString();
    url.searchParams.set("aff", lsAffiliateId);
    return url.toString();
  } catch {
    return normalized;
  }
}
