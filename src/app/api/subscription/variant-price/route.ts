import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

type VariantAttributes = {
  price?: number;
  interval?: string;
  interval_count?: number;
  product_id?: number;
};

type VariantResponse = {
  data?: {
    id?: string;
    attributes?: VariantAttributes;
  };
};

function formatCurrency(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");

    if (!variantId) {
      return NextResponse.json({ error: "Missing variantId" }, { status: 400 });
    }

    const lsResponse = await lsApi(`/variants/${variantId}`, { method: "GET" });

    if (!lsResponse.ok) {
      const text = await lsResponse.text();
      console.error("Lemon Squeezy variant lookup failed", {
        status: lsResponse.status,
        text,
      });
      return NextResponse.json(
        { error: "Could not load variant pricing" },
        { status: 502 },
      );
    }

    const payload = (await lsResponse.json()) as VariantResponse;
    const attrs = payload.data?.attributes ?? {};
    const priceCents = typeof attrs.price === "number" ? attrs.price : null;
    const interval = typeof attrs.interval === "string" ? attrs.interval : null;
    const intervalCount =
      typeof attrs.interval_count === "number" ? attrs.interval_count : 1;

    if (priceCents == null || interval == null) {
      return NextResponse.json(
        { error: "Variant is missing pricing information" },
        { status: 502 },
      );
    }

    // Store currency. Lemon Squeezy variant objects don't directly expose
    // currency; default to USD which matches the store configuration.
    const currency = "USD";

    let offerType: "monthly_50_off_3mo" | "yearly_20_off_1yr" | null = null;
    let offerPercent = 0;
    let offerDurationMonths = 0;

    if (interval === "month") {
      offerType = "monthly_50_off_3mo";
      offerPercent = 50;
      offerDurationMonths = 3;
    } else if (interval === "year") {
      offerType = "yearly_20_off_1yr";
      offerPercent = 20;
      offerDurationMonths = 12;
    }

    const periodLabel =
      interval === "month"
        ? "month"
        : interval === "year"
        ? "year"
        : interval ?? "period";

    const currentFormatted = `${formatCurrency(priceCents, currency)}/${periodLabel}`;

    let discountedFormatted: string | null = null;
    let totalSavingsFormatted: string | null = null;
    let nextChargeFormatted: string | null = null;

    if (offerType) {
      const discountedCents = Math.round(priceCents * (1 - offerPercent / 100));

      if (offerType === "monthly_50_off_3mo") {
        discountedFormatted = `${formatCurrency(discountedCents, currency)}/month for 3 months`;
        const savingsCents = (priceCents - discountedCents) * 3;
        totalSavingsFormatted = formatCurrency(savingsCents, currency);
        nextChargeFormatted = formatCurrency(discountedCents, currency);
      } else {
        discountedFormatted = `${formatCurrency(discountedCents, currency)} for the next year`;
        const savingsCents = priceCents - discountedCents;
        totalSavingsFormatted = formatCurrency(savingsCents, currency);
        nextChargeFormatted = formatCurrency(discountedCents, currency);
      }
    }

    return NextResponse.json({
      priceCents,
      currency,
      interval,
      intervalCount,
      offerType,
      offerPercent,
      offerDurationMonths,
      currentFormatted,
      discountedFormatted,
      totalSavingsFormatted,
      nextChargeFormatted,
    });
  } catch (error) {
    console.error("variant-price error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
