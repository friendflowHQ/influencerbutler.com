import type { LinkTarget } from "./types";
import { withAffiliateTag } from "./url";

// Small helpers shared by the real API adapters (deeplink providers and
// affiliate networks). Kept tiny and dependency-light so every adapter parses
// provider JSON and reads error messages the same way.

export const REQUEST_TIMEOUT_MS = 30_000;

// A neutral, always-valid target for read-only test calls that need a url.
export const TEST_TARGET_URL = "https://www.amazon.com/";

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function firstString(...values: unknown[]): string {
  for (const value of values) {
    const s = str(value);
    if (s) return s;
  }
  return "";
}

export function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// Best-effort human message from a provider's JSON error body, else the fallback.
export async function providerError(res: Response, fallback: string): Promise<string> {
  try {
    const data = obj(await res.json());
    const msg = str(data.message || data.error || data.error_description || data.detail);
    return msg ? `${msg} (status ${res.status})` : fallback;
  } catch {
    return fallback;
  }
}

// The product url with the resolved affiliate tag applied, if any.
export function taggedUrlFor(target: LinkTarget): string {
  return target.tag ? withAffiliateTag(target.url, target.tag) : target.url;
}
