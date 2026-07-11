import { randomBytes } from "crypto";
import { lsApi } from "@/lib/lemonsqueezy";

export type CreateBrandedDiscountInput = {
  storeId: string;
  code: string;
  percentOff: number;
  /**
   * Phase F (2026-05-20): LS variant IDs the discount should be scoped to.
   * The Daily Deals Workspace add-on variant MUST be absent from this list
   * - that's belt 3 of the triple-belt promo-exclusion contract. Callers
   * should pass getDiscountableVariantIds() from lemonsqueezy.ts.
   *
   * When omitted, LS applies the discount to ALL variants (the unsafe
   * default). createBrandedDiscount now requires it explicitly to force
   * the caller to think about scope.
   */
  variantIds?: string[];
};

export type CreateBrandedDiscountResult =
  | { ok: true; discountId: string }
  | { ok: false; conflict: boolean };

/**
 * Creates a branded percent-off discount in Lemon Squeezy (e.g. "JOHN" → 15%).
 * On duplicate code (422 from LS) returns `{ ok: false, conflict: true }` so
 * the caller can try a numbered variant. No redemption cap - this is meant
 * to be shared broadly by the affiliate.
 *
 * Scoped to `variantIds` if provided so the discount never lands on add-on
 * SKUs (Phase F promo-exclusion contract).
 */
export async function createBrandedDiscount(
  input: CreateBrandedDiscountInput,
): Promise<CreateBrandedDiscountResult> {
  try {
    const relationships: Record<string, unknown> = {
      store: { data: { type: "stores", id: input.storeId } },
    };
    if (input.variantIds && input.variantIds.length > 0) {
      relationships.variants = {
        data: input.variantIds.map((id) => ({ type: "variants", id })),
      };
    }
    const response = await lsApi(`/discounts`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "discounts",
          attributes: {
            name: `Affiliate code ${input.code} (${input.percentOff}%)`,
            code: input.code,
            amount: input.percentOff,
            amount_type: "percent",
            duration: "once",
          },
          relationships,
        },
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { data?: { id?: string } };
      const discountId = payload.data?.id;
      if (!discountId) {
        console.error("LS branded discount create returned no id", { code: input.code });
        return { ok: false, conflict: false };
      }
      return { ok: true, discountId };
    }

    const text = await response.text().catch(() => "");
    const isConflict = response.status === 422 && /already.*taken|already.*exists|has already been taken/i.test(text);
    if (!isConflict) {
      console.error("LS branded discount create failed", {
        status: response.status,
        body: text.slice(0, 500),
        code: input.code,
      });
    }
    return { ok: false, conflict: isConflict };
  } catch (error) {
    console.error("LS branded discount create threw", error);
    return { ok: false, conflict: false };
  }
}

export type DiscountState = {
  exists: boolean;
  percent: number | null;
  expiresAt: string | null;
  redeemed: boolean;
};

/**
 * Reads a discount's live state from Lemon Squeezy: percent, expiry, whether
 * it still exists, and whether it has been redeemed (our minted codes are
 * max_redemptions 1, so any redemption row means spent). Returns null when LS
 * is unreachable so callers can fall back to locally derived data.
 */
export async function fetchDiscountState(discountId: string): Promise<DiscountState | null> {
  try {
    const [discountRes, redemptionsRes] = await Promise.all([
      lsApi(`/discounts/${discountId}`, { method: "GET" }),
      lsApi(
        `/discount-redemptions?filter[discount_id]=${encodeURIComponent(discountId)}&page[size]=1`,
        { method: "GET" },
      ),
    ]);

    if (discountRes.status === 404) {
      return { exists: false, percent: null, expiresAt: null, redeemed: false };
    }
    if (!discountRes.ok) {
      const text = await discountRes.text().catch(() => "");
      console.error("LS discount state fetch failed", {
        status: discountRes.status,
        body: text.slice(0, 300),
      });
      return null;
    }

    const discountPayload = (await discountRes.json()) as {
      data?: { attributes?: { amount?: number | null; amount_type?: string | null; expires_at?: string | null } };
    };
    const attrs = discountPayload.data?.attributes ?? {};
    const percent =
      attrs.amount_type === "percent" && typeof attrs.amount === "number" ? attrs.amount : null;

    let redeemed = false;
    if (redemptionsRes.ok) {
      const redemptionPayload = (await redemptionsRes.json()) as { data?: unknown[] };
      redeemed = (redemptionPayload.data ?? []).length > 0;
    }

    return {
      exists: true,
      percent,
      expiresAt: attrs.expires_at ?? null,
      redeemed,
    };
  } catch (error) {
    console.error("LS discount state fetch threw", error);
    return null;
  }
}

export type CreateUniqueDiscountInput = {
  storeId: string;
  percentOff: number;
  namePrefix?: string;
  /** ISO timestamp passed to LS as `expires_at`. */
  expiresAt?: string | null;
  /** If provided, LS restricts the code to these variant IDs only. */
  variantIds?: string[];
  /** Override the human-readable `name` attribute shown in the LS dashboard. */
  name?: string;
  /**
   * When set (>= 1), the discount recurs for this many billing cycles
   * (LS `duration: "repeating"`, `duration_in_months: N`) instead of the
   * default one-time `duration: "once"`. Comps use this: a one-time 100% code
   * on a monthly plan still bills from month 2, so a multi-month comp must
   * repeat for the whole free window.
   */
  durationMonths?: number;
};

/**
 * Creates a single-use, percent-off discount in Lemon Squeezy and returns
 * the generated code + LS record id. Used for the 5-day affiliate conversion
 * tier and the free-trial funnel, where each user gets their own code so
 * links can't be re-shared.
 *
 * Returns null + logs on failure.
 */
export async function createUniqueDiscount(
  input: CreateUniqueDiscountInput,
): Promise<{ code: string; discountId: string } | null> {
  const prefix = input.namePrefix ?? "AFF";
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  // LS discount codes may only contain uppercase letters and numbers - a
  // hyphen between prefix and suffix gets the whole request rejected (422).
  const code = `${prefix}${suffix}`;
  const displayName = input.name ?? `Discount ${input.percentOff}% (${code})`;

  const attributes: Record<string, unknown> = {
    name: displayName,
    code,
    amount: input.percentOff,
    amount_type: "percent",
    is_limited_redemptions: true,
    max_redemptions: 1,
  };

  // Default is a one-time discount; a multi-month comp must recur for the whole
  // free window (LS "repeating" + duration_in_months) or it re-bills from cycle 2.
  if (input.durationMonths && input.durationMonths >= 1) {
    attributes.duration = "repeating";
    attributes.duration_in_months = Math.floor(input.durationMonths);
  } else {
    attributes.duration = "once";
  }

  if (input.expiresAt) {
    attributes.expires_at = input.expiresAt;
  }

  const relationships: Record<string, unknown> = {
    store: {
      data: { type: "stores", id: input.storeId },
    },
  };

  if (input.variantIds && input.variantIds.length > 0) {
    relationships.variants = {
      data: input.variantIds.map((id) => ({ type: "variants", id })),
    };
  }

  try {
    const response = await lsApi(`/discounts`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "discounts",
          attributes,
          relationships,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("LS discount create failed", {
        status: response.status,
        body: text.slice(0, 500),
      });
      return null;
    }

    const payload = (await response.json()) as { data?: { id?: string } };
    const discountId = payload.data?.id;
    if (!discountId) {
      console.error("LS unique discount create returned no id", { code });
      return null;
    }

    return { code, discountId };
  } catch (error) {
    console.error("LS discount create threw", error);
    return null;
  }
}
