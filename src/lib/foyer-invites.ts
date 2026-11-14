/**
 * Invite-only Foyer page pilot: Storefront Score pages for Amazon / Walmart
 * creators (see supabase/migrations/20261111_foyer_invites.sql and
 * 20261112_foyer_invites_v2.sql).
 *
 * Owns:
 *   - the invite record shape + funnel status rules;
 *   - the per-creator email fill the email-marketing cron applies to the
 *     "Invite: Storefront Score (Instagram)" cold sequence. Each creator's own
 *     written emails live in foyer_invites.email_steps; the shared sequence
 *     steps are only {{INVITE_SUBJECT_n}} / {{INVITE_BODY_n}} slots, and the
 *     written bodies carry {{INVITE_PREVIEW_URL}} (the private page link, known
 *     only after upload). A step with no written email HOLDS (the two monthly
 *     "your score changed" notes wait until one is written);
 *   - preview lifetime (90 days from the first email) and content deletion.
 *
 * No invented numbers: the old live "creators use it" count is gone; only
 * figures Liz supplies may appear, and they are written into the emails.
 */
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/admin";

export const INVITE_SEQUENCE_ID = "f0e10001-0000-4000-a000-000000000001";
export const INVITE_COMP_DAYS = 14;
export const INVITE_COMP_PLAN = "power-solo-monthly";
/** Unclaimed pages are deleted this long after the first email. */
export const INVITE_PREVIEW_DAYS = 90;
export const INVITE_STEP_COUNT = 6;

export type InviteStatus =
  | "drafted"
  | "sent"
  | "viewed"
  | "claimed"
  | "activated"
  | "published"
  | "converted"
  | "declined"
  | "replied"
  | "removed";

export const INVITE_STATUSES: readonly InviteStatus[] = [
  "drafted", "sent", "viewed", "claimed", "activated", "published", "converted", "replied", "declined", "removed",
];

/** Statuses that still receive the drip. Anything else stops it. */
export const DRIP_STATUSES: readonly InviteStatus[] = ["drafted", "sent", "viewed"];

/** Funnel rank: a status only ever moves forward. Terminal states never move. */
const RANK: Record<InviteStatus, number> = {
  drafted: 0, sent: 1, viewed: 2, claimed: 3, activated: 4, published: 5, converted: 6,
  replied: 50, declined: 98, removed: 99,
};
const TERMINAL: ReadonlySet<InviteStatus> = new Set(["declined", "removed"]);

export type EmailStep = { subject: string; body: string };

export type ScoreFix = {
  id: string;
  title: string;
  why: string;
  withButler: string;
  butlers: string[];
  byHandNote?: string;
};

export type InviteScore = {
  score: number;
  components: Record<string, { points: number; max: number; value: unknown; known?: boolean }>;
  fixes: ScoreFix[];
  facts?: Record<string, unknown>;
};

/** One of the creator's own storefront posts that can earn more today (v3). */
export type OpportunityPost = {
  postUrl: string;
  thumbUrl: string;
  kind: string;
  title: string;
  asin: string;
  deal: { percentOff: number; endsDisplay?: string; category?: string } | null;
  campaign: { ratePct: number; brand?: string; endsAt?: string | null } | null;
  perSale: { baseRatePct?: number; base: number | null; campaign: number | null };
  caption: string;
};

export type InviteOpportunities = {
  posts: OpportunityPost[];
  counts: { deals: number; campaigns: number; both?: number };
  postsRead?: number | null;
  dealsSnapshotAt?: string | null;
  readAt?: string | null;
};

/** Campaign posts shown before claim; the rest unlock on claim. */
export const FREE_CAMPAIGN_POSTS = 3;

/** Validate an uploaded opportunities blob (shape only; the app computed it). */
export function normalizeOpportunities(raw: unknown): InviteOpportunities | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const posts = Array.isArray(o.posts) ? (o.posts as OpportunityPost[]) : [];
  const ok = posts.length > 0 && posts.every((p) => {
    if (!p || typeof p.postUrl !== "string") return false;
    try {
      return /(^|\.)amazon\.[a-z.]+$/i.test(new URL(p.postUrl).hostname) && Boolean(p.deal || p.campaign);
    } catch {
      return false;
    }
  });
  if (!ok) return null;
  const counts = (o.counts && typeof o.counts === "object" ? o.counts : {}) as InviteOpportunities["counts"];
  return {
    posts: posts.slice(0, 24),
    counts: { deals: Number(counts.deals) || 0, campaigns: Number(counts.campaigns) || 0, both: Number(counts.both) || 0 },
    postsRead: Number.isFinite(Number(o.postsRead)) ? Number(o.postsRead) : null,
    dealsSnapshotAt: typeof o.dealsSnapshotAt === "string" ? o.dealsSnapshotAt : null,
    readAt: typeof o.readAt === "string" ? o.readAt : null,
  };
}

/** What the page may show before a claim: every deal post, the first few campaign posts. */
export function publicOpportunities(op: InviteOpportunities | null, claimed: boolean): {
  dealPosts: OpportunityPost[];
  campaignPosts: OpportunityPost[];
  lockedCampaigns: number;
} {
  const posts = op && Array.isArray(op.posts) ? op.posts : [];
  const dealPosts = posts.filter((p) => p.deal);
  const allCampaign = posts.filter((p) => p.campaign && !p.deal);
  const campaignPosts = claimed ? allCampaign : allCampaign.slice(0, FREE_CAMPAIGN_POSTS);
  return { dealPosts, campaignPosts, lockedCampaigns: allCampaign.length - campaignPosts.length };
}

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
  email_steps: EmailStep[];
  score: InviteScore | null;
  opportunities: InviteOpportunities | null;
  storefront_url: string;
  time_on_page_ms: number;
  claim_clicked_at: string | null;
  replied_at: string | null;
  removed_at: string | null;
  content_deleted_at: string | null;
};

/** Columns safe to list (no page_doc / preview_html blobs). */
export const INVITE_LIST_COLUMNS =
  "id, code, ig_handle, email, first_name, niche, followers, opener, batch, source, status, notes, created_at, sent_at, expires_at, viewed_at, view_count, claimed_at, activated_at, published_at, converted_at, declined_at, license_key, existing_customer, email_steps, score, opportunities, storefront_url, time_on_page_ms, claim_clicked_at, replied_at, removed_at, content_deleted_at";

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
  if (TERMINAL.has(from)) return false;
  return RANK[to] > RANK[from];
}

/** An unclaimed page whose 90 days are up (or whose content is already gone). */
export function isExpired(
  row: Pick<InviteRow, "expires_at" | "status"> & { content_deleted_at?: string | null },
  now = Date.now(),
): boolean {
  if (row.content_deleted_at) return true;
  if (RANK[row.status] >= RANK.claimed && RANK[row.status] <= RANK.converted) return false;
  if (!row.expires_at) return false;
  const t = new Date(row.expires_at).getTime();
  return Number.isFinite(t) && t <= now;
}

export function formatInviteDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });
}

/** Normalize the written emails from an upload: up to 6 {subject, body} pairs. */
export function normalizeEmailSteps(raw: unknown): EmailStep[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EmailStep[] = [];
  for (const s of raw.slice(0, INVITE_STEP_COUNT)) {
    const o = (s ?? {}) as Record<string, unknown>;
    const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 120) : "";
    const body = typeof o.body === "string" ? o.body.trim().slice(0, 4000) : "";
    if (!subject || !body) return null;
    if (subject.includes("\u2014") || body.includes("\u2014")) return null;
    out.push({ subject, body });
  }
  return out;
}

export type InvitePlaceholderValues = {
  firstName: string;
  handle: string;
  previewUrl: string;
  expires: string;
  steps: EmailStep[];
};

export function inviteValuesFor(
  row: Pick<InviteRow, "first_name" | "ig_handle" | "code" | "expires_at"> & { email_steps?: EmailStep[] | null },
): InvitePlaceholderValues {
  return {
    firstName: (row.first_name || "").trim() || "there",
    handle: row.ig_handle,
    previewUrl: previewUrlFor(row.code),
    expires: formatInviteDate(row.expires_at),
    steps: Array.isArray(row.email_steps) ? row.email_steps : [],
  };
}

/**
 * Fill a step: first the per-creator {{INVITE_SUBJECT_n}} / {{INVITE_BODY_n}}
 * slots, then the inner {{INVITE_*}} tokens the written email carries. Returns
 * null when anything would go out empty or unresolved (the cron then holds the
 * enrollment instead of sending a broken email).
 */
export function personalizeInviteText(text: string, v: InvitePlaceholderValues): string | null {
  let out = text.replace(/\{\{INVITE_(SUBJECT|BODY)_(\d)\}\}/g, (_m, kind: string, n: string) => {
    const step = v.steps[Number(n) - 1];
    const value = step ? (kind === "SUBJECT" ? step.subject : step.body) : "";
    return value || "\u0000MISSING\u0000";
  });
  if (out.includes("\u0000MISSING\u0000")) return null;
  const map: Record<string, string> = {
    INVITE_FIRST_NAME: v.firstName,
    INVITE_HANDLE: v.handle,
    INVITE_PREVIEW_URL: v.previewUrl,
    INVITE_EXPIRES: v.expires,
  };
  for (const [key, value] of Object.entries(map)) {
    const token = `{{${key}}}`;
    if (!out.includes(token)) continue;
    if (!value) return null;
    out = out.split(token).join(value);
  }
  if (/\{\{[A-Z_0-9]+\}\}/.test(out)) return null;
  return out;
}

/** Does the creator have a written email for this sequence step (1-based)? */
export function hasWrittenStep(row: { email_steps?: EmailStep[] | null }, position: number): boolean {
  const s = Array.isArray(row.email_steps) ? row.email_steps[position - 1] : null;
  return Boolean(s && s.subject && s.body);
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
 * Stamp the first send: status drafted -> sent and start the 90-day clock.
 * Returns the row with expires_at filled.
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

/** Stop the invite drip for an email (claimed, replied, removed or declined). */
export async function cancelInviteEnrollment(db: SupabaseClient, email: string): Promise<void> {
  const { error } = await db
    .from("email_sequence_enrollments")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("sequence_id", INVITE_SEQUENCE_ID)
    .eq("email", email.trim().toLowerCase());
  if (error) console.error("foyer-invites: cancel enrollment failed", error);
}

/** The page content columns, cleared on removal and at the 90-day mark. */
export const CLEARED_CONTENT = {
  page_doc: null,
  preview_html: null,
  score: null,
  opportunities: null,
  email_steps: [],
  opener: "",
} as const;

/** True for a live paying or trialing account (never invite existing customers). */
export async function isExistingCustomer(db: SupabaseClient, email: string): Promise<boolean> {
  const { data: prof } = await db.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
  const userId = (prof as { id?: string } | null)?.id;
  if (!userId) return false;
  const { data: subs } = await db
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "on_trial", "past_due", "paused"])
    .limit(1);
  return Array.isArray(subs) && subs.length > 0;
}
