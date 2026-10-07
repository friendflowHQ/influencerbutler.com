import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Small fixed-window rate limiter.
 *
 * Two layers:
 *  1. In-memory counter (per serverless instance, best effort). Always runs, so
 *     the limiter still protects us if the database is unreachable or the
 *     migration below has not been applied yet.
 *  2. Durable counter via the `rate_limit_hit` SQL function
 *     (supabase/migrations/20261007_rate_limits.sql), shared across instances.
 *     If the function is missing or errors we silently fall back to layer 1.
 *
 * Keys are SHA-256 hashed before they touch the database so emails and IPs are
 * never stored in the clear.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets (only meaningful when !allowed). */
  retryAfterSec: number;
};

type Bucket = { count: number; resetAt: number };
const memory = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of memory) {
    if (b.resetAt <= now) memory.delete(k);
  }
}

function hitMemory(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: limit >= 1, retryAfterSec: windowSec };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

let durableWarned = false;

async function hitDurable(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: hashKey(key),
      p_window_seconds: windowSec,
    });
    if (error || typeof data !== "number") {
      if (!durableWarned) {
        durableWarned = true;
        console.error(
          "rate-limit: durable counter unavailable, using in-memory only",
          error?.message ?? "unexpected response",
        );
      }
      return null;
    }
    return data <= limit;
  } catch (err) {
    if (!durableWarned) {
      durableWarned = true;
      console.error("rate-limit: durable counter threw, using in-memory only", err);
    }
    return null;
  }
}

/**
 * Count one hit against `key` and report whether it is within `limit` hits per
 * `windowSec`. Namespace keys by route, e.g. `login-link:ip:1.2.3.4`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const mem = hitMemory(key, limit, windowSec);
  if (!mem.allowed) return mem;
  const durable = await hitDurable(key, limit, windowSec);
  if (durable === false) return { allowed: false, retryAfterSec: windowSec };
  return mem;
}

/** Test helper: clear the in-memory buckets. */
export function __resetRateLimitMemory() {
  memory.clear();
  durableWarned = false;
}
