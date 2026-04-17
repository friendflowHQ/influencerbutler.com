const LS_API_BASE_URL = "https://api.lemonsqueezy.com/v1";

export async function lsApi(path: string, options: RequestInit = {}) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;

  if (!apiKey) {
    throw new Error("Missing LEMONSQUEEZY_API_KEY environment variable");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return fetch(`${LS_API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      ...(options.headers ?? {}),
    },
  });
}

export type VariantResolution =
  | { ok: true; variantId: string }
  | { ok: false; reason: "missing-input" | "missing-env"; envVar?: string };

export function resolveVariantId(
  plan: string | undefined,
  fallback: string | undefined,
): VariantResolution {
  if (plan === "monthly") {
    const id = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
    if (!id) return { ok: false, reason: "missing-env", envVar: "LEMONSQUEEZY_VARIANT_MONTHLY" };
    return { ok: true, variantId: id };
  }
  if (plan === "annual") {
    const id = process.env.LEMONSQUEEZY_VARIANT_ANNUAL;
    if (!id) return { ok: false, reason: "missing-env", envVar: "LEMONSQUEEZY_VARIANT_ANNUAL" };
    return { ok: true, variantId: id };
  }
  if (fallback) {
    return { ok: true, variantId: fallback };
  }
  return { ok: false, reason: "missing-input" };
}
