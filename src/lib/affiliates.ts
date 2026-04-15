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
  | { state: "active"; affiliate: AffiliateSummary; lsAffiliateId: string }
  | { state: "disabled"; affiliate: AffiliateSummary; lsAffiliateId: string }
  | { state: "error"; message: string };

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
