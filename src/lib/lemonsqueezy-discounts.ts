import { randomBytes } from "crypto";
import { lsApi } from "@/lib/lemonsqueezy";

export type CreateBrandedDiscountInput = {
  storeId: string;
  code: string;
  percentOff: number;
};

export type CreateBrandedDiscountResult =
  | { ok: true; discountId: string }
  | { ok: false; conflict: boolean };

/**
 * Creates a branded percent-off discount in Lemon Squeezy (e.g. "JOHN" → 15%).
 * On duplicate code (422 from LS) returns `{ ok: false, conflict: true }` so
 * the caller can try a numbered variant. No redemption cap — this is meant
 * to be shared broadly by the affiliate.
 */
export async function createBrandedDiscount(
  input: CreateBrandedDiscountInput,
): Promise<CreateBrandedDiscountResult> {
  try {
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
          relationships: {
            store: { data: { type: "stores", id: input.storeId } },
          },
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
  const code = `${prefix}-${suffix}`;
  const displayName = input.name ?? `Discount ${input.percentOff}% (${code})`;

  const attributes: Record<string, unknown> = {
    name: displayName,
    code,
    amount: input.percentOff,
    amount_type: "percent",
    duration: "once",
    is_limited_redemptions: true,
    max_redemptions: 1,
  };

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
