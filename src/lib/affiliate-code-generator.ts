import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/admin";
import { createBrandedDiscount } from "@/lib/lemonsqueezy-discounts";

type GenInput = {
  firstName: string;
  storeId: string;
  percentOff: number;
};

type GenResult = { code: string; discountId: string } | null;

const MAX_NUMBERED_SUFFIX = 99;

function sanitizeBase(firstName: string): string {
  return firstName.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomFallbackBase(): string {
  return `AFF${randomBytes(3).toString("hex").toUpperCase()}`;
}

type LookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
      };
    };
  };
};

async function isCodeTakenLocally(client: LookupClient, code: string): Promise<boolean> {
  try {
    const { data } = await client
      .from("profiles")
      .select("id")
      .eq("affiliate_code", code)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error("affiliate-code-generator: local lookup threw", error);
    return false;
  }
}

/**
 * Generates a branded discount code for an affiliate, preferring their first
 * name (uppercased, alphanumeric only). On collision — either locally in our
 * DB or in Lemon Squeezy — appends an incrementing number: JOHN → JOHN2 →
 * JOHN3 → ... up to JOHN99. Falls back to AFF + random hex if the sanitized
 * first name is too short.
 *
 * Returns null if every candidate collides or a non-recoverable LS error
 * happens. Caller should still complete approval; affiliate just won't have
 * a branded code.
 */
export async function generateAndCreateAffiliateCode(input: GenInput): Promise<GenResult> {
  const sanitized = sanitizeBase(input.firstName);
  const base = sanitized.length >= 2 ? sanitized : randomFallbackBase();
  const useCollisionLoop = sanitized.length >= 2;

  const lookupClient = createAdminClient() as unknown as LookupClient | null;

  const candidates: string[] = [base];
  if (useCollisionLoop) {
    for (let i = 2; i <= MAX_NUMBERED_SUFFIX; i++) {
      candidates.push(`${base}${i}`);
    }
  }

  for (const candidate of candidates) {
    // Local-DB pre-check saves an LS API call when we already gave the code
    // to someone else.
    if (lookupClient) {
      const taken = await isCodeTakenLocally(lookupClient, candidate);
      if (taken) continue;
    }

    const result = await createBrandedDiscount({
      storeId: input.storeId,
      code: candidate,
      percentOff: input.percentOff,
    });

    if (result.ok) {
      return { code: candidate, discountId: result.discountId };
    }

    if (!result.conflict) {
      // Non-conflict error (network, auth, etc.) — stop burning retries.
      return null;
    }
    // conflict → try next candidate
  }

  console.error("affiliate-code-generator: all candidates exhausted", {
    base,
    tried: candidates.length,
  });
  return null;
}
