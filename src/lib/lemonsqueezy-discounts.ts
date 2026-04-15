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
};

/**
 * Creates a single-use, percent-off discount in Lemon Squeezy and returns
 * the generated code. Used for the 5-day affiliate conversion tier where
 * each affiliate gets their own code so links can't be re-shared.
 *
 * Returns null + logs on failure.
 */
export async function createUniqueDiscount(
  input: CreateUniqueDiscountInput,
): Promise<{ code: string } | null> {
  const prefix = input.namePrefix ?? "AFF";
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const code = `${prefix}-${suffix}`;

  try {
    const response = await lsApi(`/discounts`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "discounts",
          attributes: {
            name: `Affiliate conversion ${input.percentOff}% (${code})`,
            code,
            amount: input.percentOff,
            amount_type: "percent",
            duration: "once",
            is_limited_redemptions: true,
            max_redemptions: 1,
          },
          relationships: {
            store: {
              data: { type: "stores", id: input.storeId },
            },
          },
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

    return { code };
  } catch (error) {
    console.error("LS discount create threw", error);
    return null;
  }
}
