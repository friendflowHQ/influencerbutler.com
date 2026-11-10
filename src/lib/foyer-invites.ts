/**
 * Invite-only "done-for-you Foyer page" pilot (see
 * supabase/migrations/20261111_foyer_invites.sql).
 *
 * Owns:
 *   - the invite record shape + lookups (by code, by email, by id);
 *   - the {{INVITE_*}} / {{CREATOR_COUNT}} placeholder fill the email-marketing
 *     cron applies to the "Invite: Foyer page (Instagram)" cold sequence, so one
 *     shared sequence carries a unique, researched opener per creator;
 *   - the truthful social-proof phrase (paying subscribers right now, rounded
 *     DOWN, comps excluded).
 *
 * Every write goes through the service-role client; callers gate public routes
 * with the invite code (a random capability) and admin routes with
 * requirePermission.
 */
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/admin";

export const INVITE_SEQUENCE_ID = "f0e10001-0000-4000-a000-000000000001";
export const INVITE_COMP_DAYS = 14;
export const INVITE_COMP_PLAN = "power-solo-monthly";
/** How long the preview stays up after the first email goes out. */
export const INVITE_PREVIEW_DAYS = 14;

export type InviteStatus =
  | "drafted"
  | "sent"
  | "viewed"
  | "claimed"
  | "activated"
  | "published"
  | "converted"
  | "declined";

export const INVITE_STATUSES: readonly InviteStatus[] = [
  "drafted", "sent", "viewed", "claimed", "activated", "published", "converted", "declined",
];

/** Funnel rank: a status only ever moves forward (declined is terminal). */
const RANK: Record<InviteStatus, number> = {
  drafted: 0, sent: 1, viewed: 2, claimed: 3, activated: 4, published: 5, converted: 6, declined: 99,
};

export type InviteRow = {
  id: string;
  code: string;
  ig_handle: string;
  email: string;
  first_name: string;
  niche: string;
  followers: number | null;
  opener: string;
  batch: string;
  source: string;
  status: InviteStatus;
  notes: string;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  view_count: number;
  claimed_at: string | null;
  activated_at: string | null;
  published_at: string | null;
  converted_at: string | null;
  declined_at: string | null;
  license_key: string | null;
  existing_customer: boolean;
};

/** Columns safe to list (no page_doc / preview_html blobs). */
export const INVITE_LIST_COLUMNS =
  "id, code, ig_handle, email, first_name, niche, followers, opener, batch, source, status, notes, created_at, sent_at, expires_at, viewed_at, view_count, claimed_at, activated_at, published_at, converted_at, declined_at, license_key, existing_customer";

export function inviteDb(): SupabaseClient | null {
  try {
    return createAdminClient() as unknown as SupabaseClient | null;
  } catch {
    return null;
  }
}

export function newInviteCode(): string {
  return randomBytes(12).toString("base64url");
}

export function isValidInviteCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z0-9_-]{12,40}$/.test(code);
}

export function siteBase(): string {
  return (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com").replace(/\/$/, "");
}

export function previewUrlFor(code: string): string {
  return `${siteBase()}/p/${code}`;
}

/** https bounce that opens influencerbutler://claim in the desktop app (Gmail keeps https hrefs). */
export function openInAppUrlFor(code: string): string {
  return `${siteBase()}/app/open?to=${encodeURIComponent(`influencerbutler://claim?code=${code}`)}`;
}

/** True when moving from `from` to `to` is forward progress in the funnel. */
export function advances(from: InviteStatus, to: InviteStatus): boolean {
  if (from === "declined") return false;
  return RANK[to] > RANK[from];
}

export function isExpired(row: Pick<InviteRow, "expires_at" | "status">, now = Date.now()): boolean {
  if (RANK[row.status] >= RANK.claimed && row.status !== "declined") return false;
  if (!row.expires_at) return false;
  const t = new Date(row.expires_at).getTime();
  return Number.isFinite(t) && t <= now;
}

/**
 * The social-proof phrase that starts a sentence: "300+" style, always rounded
 * DOWN so it is never an overstatement; under 20 we say "Creators" (no number).
 */
export function creatorCountPhrase(n: number): string {
  if (!Number.isFinite(n) || n < 20) return "Creators";
  const step = n >= 1000 ? 100 : n >= 100 ? 50 : 10;
  return `${Math.floor(n / step) * step}+`;
}

/** Paying subscribers right now: active, not a comp, not the Deals add-on. */
export async function countPayingCreators(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db
    .from("subscriptions")
    .select("ls_subscription_id, ls_variant_id, status")
    .eq("status", "active");
  if (error || !data) return null;
  const addon = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON ?? "";
  return (data as { ls_subscription_id: string | null; ls_variant_id: string | null }[]).filter((r) => {
    const id = String(r.ls_subscription_id ?? "");
    if (!id || id.startsWith("comp:")) return false;
    if (addon && String(r.ls_variant_id ?? "") === addon) return false;
    return true;
  }).length;
}

export function formatInviteDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });
}

export type InvitePlaceholderValues = {
  firstName: string;
  handle: string;
  opener: string;
  previewUrl: string;
  expires: string;
  creatorCount: string;
};

export const INVITE_PLACEHOLDERS = [
  "INVITE_FIRST_NAME",
  "INVITE_HANDLE",
  "INVITE_OPENER",
  "INVITE_PREVIEW_URL",
  "INVITE_EXPIRES",
  "CREATOR_COUNT",
] as const;

export function inviteValuesFor(
  row: Pick<InviteRow, "first_name" | "ig_handle" | "opener" | "code" | "expires_at">,
  creatorCount: string,
): InvitePlaceholderValues {
  const first = (row.first_name || "").trim();
  return {
    firstName: first || "there",
    handle: row.ig_handle,
    opener: (row.opener || "").trim(),
    previewUrl: previewUrlFor(row.code),
    expires: formatInviteDate(row.expires_at),
    creatorCount,
  };
}

/**
 * Fill every invite placeholder. Returns null when any placeholder would be
 * left empty or unresolved, so the cron skips the send instead of mailing a
 * broken email.
 */
export function personalizeInviteText(text: string, v: InvitePlaceholderValues): string | null {
  const map: Record<(typeof INVITE_PLACEHOLDERS)[number], string> = {
    INVITE_FIRST_NAME: v.firstName,
    INVITE_HANDLE: v.handle,
    INVITE_OPENER: v.opener,
    INVITE_PREVIEW_URL: v.previewUrl,
    INVITE_EXPIRES: v.expires,
    CREATOR_COUNT: v.creatorCount,
  };
  let out = text;
  for (const key of INVITE_PLACEHOLDERS) {
    const token = `{{${key}}}`;
    if (!out.includes(token)) continue;
    if (!map[key]) return null;
    out = out.split(token).join(map[key]);
  }
  if (/\{\{[A-Z_]+\}\}/.test(out)) return null;
  return out;
}

/** Load invites for a set of (lowercased) emails, keyed by email. */
export async function invitesByEmail(
  db: SupabaseClient,
  emails: string[],
): Promise<Map<string, InviteRow>> {
  const out = new Map<string, InviteRow>();
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  for (let i = 0; i < unique.length; i += 100) {
    const slice = unique.slice(i, i + 100);
    const { data, error } = await db.from("foyer_invites").select(INVITE_LIST_COLUMNS).in("email", slice);
    if (error) {
      console.error("foyer-invites: invitesByEmail failed", error);
      continue;
    }
    for (const row of (data ?? []) as unknown as InviteRow[]) out.set(row.email.toLowerCase(), row);
  }
  return out;
}

/**
 * Stamp the first send: status drafted -> sent and start the preview clock.
 * Returns the row with expires_at filled so the email can show the date.
 */
export async function markInviteSent(db: SupabaseClient, row: InviteRow, now = new Date()): Promise<InviteRow> {
  if (row.sent_at && row.expires_at) return row;
  const expires = new Date(now.getTime() + INVITE_PREVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const patch: Record<string, unknown> = {
    sent_at: row.sent_at ?? now.toISOString(),
    expires_at: row.expires_at ?? expires,
    updated_at: now.toISOString(),
  };
  if (advances(row.status, "sent")) patch.status = "sent";
  const { error } = await db.from("foyer_invites").update(patch).eq("id", row.id);
  if (error) console.error("foyer-invites: markInviteSent failed", error);
  return { ...row, ...(patch as Partial<InviteRow>) };
}

/** Move an invite forward in the funnel (never backward), stamping `<status>_at`. */
export async function advanceInvite(
  db: SupabaseClient,
  row: Pick<InviteRow, "id" | "status">,
  to: InviteStatus,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { ...extra, updated_at: now };
  if (advances(row.status, to)) {
    patch.status = to;
    if (to !== "drafted" && to !== "sent") patch[`${to}_at`] = now;
  }
  const { error } = await db.from("foyer_invites").update(patch).eq("id", row.id);
  if (error) {
    console.error("foyer-invites: advanceInvite failed", error);
    return false;
  }
  return true;
}

/** Stop the invite drip for an email (claimed, declined, or already a customer). */
export async function cancelInviteEnrollment(db: SupabaseClient, email: string): Promise<void> {
  const { error } = await db
    .from("email_sequence_enrollments")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("sequence_id", INVITE_SEQUENCE_ID)
    .eq("email", email.trim().toLowerCase());
  if (error) console.error("foyer-invites: cancel enrollment failed", error);
}
