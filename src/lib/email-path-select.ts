// "Choose your path" self-select links for the Dani Austin giveaway welcome drip:
// shared constants, signed per-recipient links, and body personalization.
//
// The welcome sequence step body carries {{PATH_BEGINNER_URL}} and
// {{PATH_CREATOR_URL}} placeholders; the email-marketing cron replaces them with
// per-recipient signed URLs at send time (see personalizePathBody). The links are
// stateless: an HMAC of the normalized recipient + chosen path proves the click
// came from an email we sent, so no per-send token row is needed, exactly like
// the one-click unsubscribe and extension-review links.
//
// The signed endpoint (/api/email/path) tags the clicker ib-beginner or
// ib-creator, which auto-enrolls them into the matching branch sequence, and
// cancels their welcome enrollment so they are not double-dripped. The three
// sequences live in supabase/migrations/20260903_dani_austin_amazon_side_hustle_sequences.sql.

import crypto from "node:crypto";
import { normalizeEmail } from "@/lib/email-unsubscribe";

/** The two branches a giveaway subscriber can self-select into. */
export type FunnelPath = "beginner" | "creator";

/** Contact tags that auto-enroll an address into each branch sequence. */
export const PATH_TAGS: Record<FunnelPath, string> = {
  beginner: "ib-beginner",
  creator: "ib-creator",
};

/** email_subscribers.source stamped when a contact is created via a path click. */
export const PATH_SELECT_SOURCE = "dani-path-select";

/**
 * Hardcoded welcome sequence id from the seed migration. The path route cancels
 * this enrollment when someone branches, so the universal welcome drip stops once
 * they have chosen a track. Keep in sync with the migration's UUID.
 */
export const DANI_WELCOME_SEQUENCE_ID = "1a5e0006-0000-4000-a000-000000000006";

/** Where each branch click lands the reader after tagging + enrolling them. */
export const PATH_LANDING: Record<FunnelPath, string> = {
  beginner: "/help/tutorials/facebook-group-builder",
  creator: "/help/tutorials/getting-started-influencer-butler",
};

export function isFunnelPath(value: string): value is FunnelPath {
  return value === "beginner" || value === "creator";
}

function siteUrl(): string {
  const raw =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  return raw.replace(/\/$/, "");
}

// Same secret fallbacks as email-unsubscribe / extension-review: a dedicated
// secret is preferred, but any stable server secret works, so this needs no new
// Vercel env var. The value only needs to be stable and secret.
function secret(): string {
  const s =
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) console.error("email-path-select: no signing secret configured");
  return s;
}

/**
 * HMAC token proving a path link was issued for this address + path. The
 * "pathselect:<path>:" context keeps these tokens distinct from unsubscribe and
 * review tokens for the same email, and keeps the two paths distinct from each
 * other, so no token can be replayed as a different purpose or the other branch.
 * Empty string if no secret.
 */
export function pathSelectToken(email: string, path: FunnelPath): string {
  const key = secret();
  if (!key) return "";
  return crypto
    .createHmac("sha256", key)
    .update(`pathselect:${path}:${normalizeEmail(email)}`)
    .digest("base64url");
}

/** Constant-time verification of a token from a path link. */
export function verifyPathSelectToken(email: string, path: FunnelPath, token: string): boolean {
  const expected = pathSelectToken(email, path);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Signed self-select link: tags the clicker, enrolls the branch, stops welcome. */
export function pathSelectUrl(email: string, path: FunnelPath): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(pathSelectToken(email, path));
  return `${siteUrl()}/api/email/path?e=${e}&p=${path}&t=${t}`;
}

/**
 * Replaces the path placeholders in a sequence step body with per-recipient
 * signed URLs:
 *   {{PATH_BEGINNER_URL}}  self-select the "start from zero" deals-group track
 *   {{PATH_CREATOR_URL}}   self-select the "leverage your following" track
 * A no-op on bodies without any placeholder, so it is safe to run over every
 * sequence send. Kept pure for unit testing.
 */
export function personalizePathBody(body: string, email: string): string {
  if (!body.includes("{{")) return body;
  return body
    .split("{{PATH_BEGINNER_URL}}")
    .join(pathSelectUrl(email, "beginner"))
    .split("{{PATH_CREATOR_URL}}")
    .join(pathSelectUrl(email, "creator"));
}
