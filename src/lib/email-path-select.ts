// Signed "self-select" email links: shared constants, per-recipient signed links,
// and body personalization. Used by sequence step bodies to let a recipient pick
// a path (or opt back in) with one click.
//
// A sequence step body carries a placeholder ({{PATH_BEGINNER_URL}},
// {{PATH_CREATOR_URL}}, {{LIVE_SWEET_YES_URL}}); the email-marketing cron replaces
// it with a per-recipient signed URL at send time (see personalizePathBody). The
// links are stateless: an HMAC of the normalized recipient + chosen path proves the
// click came from an email we sent, so no per-send token row is needed, exactly
// like the one-click unsubscribe and extension-review links.
//
// The signed endpoint (/api/email/path) tags the clicker with that path's tag,
// which auto-enrolls them into the matching sequence, and cancels their originating
// welcome/gate enrollment so they are not double-dripped. Paths + their sequences:
//   beginner / creator  -> supabase/migrations/20260903_dani_austin_amazon_side_hustle_sequences.sql
//   livesweet           -> supabase/migrations/20260904_live_sweet_bundle_sequences.sql

import crypto from "node:crypto";
import { normalizeEmail } from "@/lib/email-unsubscribe";

/**
 * Hardcoded welcome/gate sequence ids from the seed migrations. The path route
 * cancels the originating enrollment when someone self-selects, so the intro drip
 * stops once they have chosen. Keep in sync with the migrations' UUIDs.
 */
export const DANI_WELCOME_SEQUENCE_ID = "1a5e0006-0000-4000-a000-000000000006";
export const LIVE_SWEET_WELCOME_SEQUENCE_ID = "1a5e0009-0000-4000-a000-000000000009";

/** A self-select path a recipient can click into. */
export type FunnelPath = "beginner" | "creator" | "livesweet";

type PathConfig = {
  /** Contact tag applied on click; auto-enrolls the matching ACTIVE sequence. */
  tag: string;
  /** Where the click lands the reader after tagging + enrolling them. */
  landing: string;
  /** The intro (welcome/gate) enrollment to cancel so they are not double-dripped. */
  cancelWelcome: string;
  /** email_subscribers.source stamped when a contact is created via this click. */
  source: string;
};

/**
 * The path registry. Adding a new list's self-select link is a new entry here plus
 * a placeholder in personalizePathBody: no new endpoint code.
 */
export const PATHS: Record<FunnelPath, PathConfig> = {
  beginner: {
    tag: "ib-beginner",
    landing: "/help/tutorials/facebook-group-builder",
    cancelWelcome: DANI_WELCOME_SEQUENCE_ID,
    source: "dani-path-select",
  },
  creator: {
    tag: "ib-creator",
    landing: "/help/tutorials/getting-started-influencer-butler",
    cancelWelcome: DANI_WELCOME_SEQUENCE_ID,
    source: "dani-path-select",
  },
  livesweet: {
    tag: "live-sweet-yes",
    landing: "/course/amazon-influencer",
    cancelWelcome: LIVE_SWEET_WELCOME_SEQUENCE_ID,
    source: "live-sweet-path-select",
  },
};

/** Convenience map of path -> enroll tag (derived from the registry). */
export const PATH_TAGS: Record<FunnelPath, string> = {
  beginner: PATHS.beginner.tag,
  creator: PATHS.creator.tag,
  livesweet: PATHS.livesweet.tag,
};

export function isFunnelPath(value: string): value is FunnelPath {
  return value === "beginner" || value === "creator" || value === "livesweet";
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
 * review tokens for the same email, and keeps the paths distinct from each other,
 * so no token can be replayed as a different purpose or a different path. Empty
 * string if no secret.
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

/** Signed self-select link: tags the clicker, enrolls the path, stops the intro drip. */
export function pathSelectUrl(email: string, path: FunnelPath): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(pathSelectToken(email, path));
  return `${siteUrl()}/api/email/path?e=${e}&p=${path}&t=${t}`;
}

/**
 * Replaces the self-select placeholders in a sequence step body with per-recipient
 * signed URLs:
 *   {{PATH_BEGINNER_URL}}   self-select the "start from zero" deals-group track
 *   {{PATH_CREATOR_URL}}    self-select the "leverage your following" track
 *   {{LIVE_SWEET_YES_URL}}  opt back in (Live Sweet re-engagement gate)
 * A no-op on bodies without any placeholder, so it is safe to run over every
 * sequence send. Kept pure for unit testing.
 */
export function personalizePathBody(body: string, email: string): string {
  if (!body.includes("{{")) return body;
  return body
    .split("{{PATH_BEGINNER_URL}}")
    .join(pathSelectUrl(email, "beginner"))
    .split("{{PATH_CREATOR_URL}}")
    .join(pathSelectUrl(email, "creator"))
    .split("{{LIVE_SWEET_YES_URL}}")
    .join(pathSelectUrl(email, "livesweet"));
}
