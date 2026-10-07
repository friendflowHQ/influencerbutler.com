/**
 * Constant-time shared-secret checks for cron / machine-to-machine routes.
 *
 * `header === \`Bearer ${secret}\`` leaks, through response timing, how many
 * leading characters of a guess were right. These helpers hash both sides with
 * SHA-256 (equal-length digests, so the length itself is not leaked either) and
 * compare with crypto.timingSafeEqual. They FAIL CLOSED: an unset or empty
 * environment variable never authorizes anything.
 */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time string equality (length-independent). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function readSecret(envName: string): string | null {
  const secret = process.env[envName];
  if (!secret) {
    console.error(`[auth-secret] ${envName} is not set - refusing to authorize`);
    return null;
  }
  return secret;
}

/**
 * True when the request carries `Authorization: Bearer <process.env[envName]>`.
 * Fails closed when the env var is unset.
 */
export function verifyBearer(request: Request, envName: string = "CRON_SECRET"): boolean {
  const secret = readSecret(envName);
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  return safeEqual(match[1].trim(), secret);
}

/**
 * True when `headerName` equals `process.env[envName]` (for routes that take the
 * secret in a custom header such as X-Cron-Secret). Fails closed when unset.
 */
export function verifySecretHeader(
  request: Request,
  headerName: string,
  envName: string = "CRON_SECRET",
): boolean {
  const secret = readSecret(envName);
  if (!secret) return false;
  const value = request.headers.get(headerName) ?? "";
  if (!value) return false;
  return safeEqual(value, secret);
}
