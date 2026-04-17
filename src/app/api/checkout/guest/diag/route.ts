import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";

/**
 * TEMPORARY DIAGNOSTIC — lists what the configured LEMONSQUEEZY_API_KEY can
 * see. Use this to figure out whether the API key, store ID, and variant IDs
 * all live in the same LS account + mode (test vs live).
 *
 * Delete this file once the checkout flow is confirmed working.
 */
export async function GET() {
  const storeEnv = process.env.LEMONSQUEEZY_STORE_ID ?? null;
  const monthlyEnv = process.env.LEMONSQUEEZY_VARIANT_MONTHLY ?? null;
  const annualEnv = process.env.LEMONSQUEEZY_VARIANT_ANNUAL ?? null;

  type LsList = {
    data?: Array<{
      id?: string;
      attributes?: {
        name?: string;
        slug?: string;
        test_mode?: boolean;
        store_id?: number | string;
        product_id?: number | string;
        status?: string;
      };
    }>;
  };

  async function hit(path: string) {
    try {
      const res = await lsApi(path);
      const text = await res.text();
      if (!res.ok) return { status: res.status, error: text.slice(0, 300) };
      try {
        return { status: res.status, body: JSON.parse(text) as LsList };
      } catch {
        return { status: res.status, body: text.slice(0, 300) };
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const [stores, variants] = await Promise.all([
    hit("/stores"),
    hit("/variants?page[size]=50"),
  ]);

  const storesSummary =
    stores.body && typeof stores.body === "object" && "data" in stores.body
      ? (stores.body as LsList).data?.map((s) => ({
          id: s.id,
          name: s.attributes?.name,
          slug: s.attributes?.slug,
        }))
      : stores;

  const variantsSummary =
    variants.body && typeof variants.body === "object" && "data" in variants.body
      ? (variants.body as LsList).data?.map((v) => ({
          id: v.id,
          name: v.attributes?.name,
          test_mode: v.attributes?.test_mode,
          store_id: v.attributes?.store_id,
          product_id: v.attributes?.product_id,
          status: v.attributes?.status,
        }))
      : variants;

  return NextResponse.json(
    {
      env: {
        store_id: storeEnv,
        variant_monthly: monthlyEnv,
        variant_annual: annualEnv,
        api_key_present: Boolean(process.env.LEMONSQUEEZY_API_KEY),
        api_key_prefix: process.env.LEMONSQUEEZY_API_KEY?.slice(0, 12) ?? null,
      },
      stores: storesSummary,
      variants: variantsSummary,
    },
    { status: 200 },
  );
}
