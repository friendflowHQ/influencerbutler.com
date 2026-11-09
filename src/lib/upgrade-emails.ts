// Beginner to Power User upgrade funnel (Funnels v2). Two plain-text emails to
// paying Beginner subscribers, counted from when their paid plan started:
//   u1, day 21: "The 3 tools you'd unlock with Power User"
//   u2, day 35: the Priority 1:1 call is a Power User perk
// The person exits as soon as their plan level becomes power (the cron checks).
//
// Unlike the older funnels there are no *_sent_at columns: progress lives in
// email_funnel_step_sends (20261109_funnels_v2_data.sql), UNIQUE(email, funnel,
// tier). sendUpgradeEmail claims the row BEFORE sending, so two overlapping
// cron runs can never both send, and releases it if the send fails so the next
// run retries. If the table is missing (migration not applied yet) nothing is
// sent at all: without a progress table there is nothing to dedupe against.
//
// Copy is registered in the track registry under the bare keys "u1" / "u2",
// which is how system-funnels.ts funnelDefaults() finds it (this file must be
// imported for that side effect, and must never import system-funnels.ts).
//
// Fact notes (keep copy honest):
//   - The 45-minute "Priority 1:1 call" needs Power (or legacy); Beginner gets a
//     403. The free 75-minute "Setup call" is open to every signed-in user, so the
//     copy never says setup calls are Power-only.
//   - Upgrading swaps the plan on the existing subscription (Lemon Squeezy
//     prorates: they pay the difference for the rest of the period) and keeps
//     the same license key.
//   - On Power User, AI moves to the person's own OpenAI key with no cap.
//   - Prices only from pricing-constants. The cron's track vars are built for
//     the Beginner base; this copy uses its own powerPrice /
//     upgradePriceLockLine so the price and lock line are Power-specific.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { withFunnelExperiment } from "@/lib/funnel-experiment-send";
import { lifecycleFrom } from "@/lib/email-senders";
import { getFunnelOverrides, resolveFunnelCopyForKey } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailFunnel } from "@/lib/email-send";
import { registerTrackCopy, type TrackCopyEntry, type TrackCopyVars } from "@/lib/funnel-track-registry";
import { parseContentKey } from "@/lib/funnel-types";
import { priceChangeActive } from "@/lib/pricing-constants";
import {
  makeLocalCodeDefault,
  mergeTrackVars,
  planPriceLabel,
  priceChangeDayLabel,
  str,
  type LifecycleTrackVars,
} from "@/lib/pro-emails";

export const UPGRADE_FUNNEL = "upgrade";
export type UpgradeTier = "u1" | "u2";

/** Default timing (days after the paid plan started). Mirrors system-funnels. */
export const UPGRADE_TIERS: readonly { tier: UpgradeTier; dayOffset: number; category: string }[] = [
  { tier: "u1", dayOffset: 21, category: "upgrade_u1" },
  { tier: "u2", dayOffset: 35, category: "upgrade_u2" },
];

const DAY_MS = 86_400_000;
const SITE = "https://www.influencerbutler.com";
const FROM_ADDRESS = lifecycleFrom();
const SIGNOFF = "- Liz";
const UPGRADE_URL_DEFAULT = `${SITE}/dashboard/subscription`;
const BOOK_URL_DEFAULT = `${SITE}/dashboard/book`;
const UPGRADE_GUIDE_URL = `${SITE}/help/tutorials/upgrade-to-power-user`;
const OPENAI_SETUP_URL = `${SITE}/help/tutorials/openai-api-setup`;

/** Used when the cron has no module-based tools line for the person. */
export const DEFAULT_UPGRADE_TOOLS_LINE = "Walmart Butler, Social Posting Butler and YouTube Butler";

export type UpgradeVars = {
  firstName: string;
  upgradeUrl: string;
  bookCallUrl: string;
  toolsLine: string;
  /** Power User Solo monthly price, e.g. "$39/month". */
  powerPrice: string;
  /** Upgrade-specific price-lock sentence, "" once the change date passed. */
  upgradePriceLockLine: string;
} & Partial<LifecycleTrackVars>;

/** "Upgrade before Nov 28 and keep today's Power User price", or "". */
export function upgradePriceLockLine(now: number = Date.now()): string {
  if (!priceChangeActive(now)) return "";
  return `Power User prices go up on ${priceChangeDayLabel()} (10pm Mountain). Switch before then and you keep today's Power User price for as long as you stay subscribed.`;
}

/** Fills every upgrade var from whatever the caller passed (cron vars, admin
 * preview vars, or nothing), so the copy never renders "undefined". */
export function upgradeVarsFrom(vars: TrackCopyVars | null | undefined, now: number = Date.now()): UpgradeVars {
  const v = vars ?? {};
  return {
    ...mergeTrackVars(v as Partial<Record<keyof LifecycleTrackVars, unknown>>, now),
    firstName: str(v.firstName) || "there",
    upgradeUrl: str(v.upgradeUrl) || UPGRADE_URL_DEFAULT,
    // The cron's Beginner-base track vars carry bookCallUrl "" (Power only);
    // the copy links the booking page for AFTER they switch, so default it.
    bookCallUrl: str(v.bookCallUrl) || BOOK_URL_DEFAULT,
    toolsLine: str(v.toolsLine) || DEFAULT_UPGRADE_TOOLS_LINE,
    powerPrice: str(v.powerPrice) || planPriceLabel("power", now),
    upgradePriceLockLine:
      typeof v.upgradePriceLockLine === "string" ? v.upgradePriceLockLine : upgradePriceLockLine(now),
  };
}

type UpgradeCopy = { subject: string; build: (v: UpgradeVars) => string };

export const UPGRADE_COPY: Record<UpgradeTier, UpgradeCopy> = {
  u1: {
    subject: "The 3 tools you'd unlock with Power User",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `Liz here. You've been on Beginner for about three weeks, so I wanted to show you what's one click away.`,
        ``,
        `Power User adds every butler. The three I'd look at first for you: ${v.toolsLine}.`,
        ``,
        `It also changes two things:`,
        `  - AI moves to your own OpenAI key with no monthly cap, instead of the 150 included actions. You pay OpenAI directly, a few dollars a month for most creators. Setup guide: ${OPENAI_SETUP_URL}`,
        `  - You can book Priority 1:1 calls with the team.`,
        ``,
        `Power User starts at ${v.powerPrice}. The switch happens on your current subscription: you only pay the difference for the rest of this billing period, and your license key, settings and earnings history stay exactly as they are.`,
        ``,
        ...(v.upgradePriceLockLine ? [v.upgradePriceLockLine, ``] : []),
        `Upgrade here, or click "Unlock Power User tools" in the app's left menu: ${v.upgradeUrl}`,
        ``,
        `Happy on Beginner? Then there's nothing to do. Reply any time with a question.`,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  u2: {
    subject: "Want a 1:1 call with the team? That's a Power User perk",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `Liz here. One thing the Beginner plan doesn't include is the Priority 1:1 call: a focused 45 minutes with the team on whatever is in your way, from a butler that isn't behaving to planning what to automate next.`,
        ``,
        `On Power User you can book one whenever you need it. You also get every butler (including ${v.toolsLine}) and unlimited AI on your own OpenAI key.`,
        ``,
        `Upgrade in one click: ${v.upgradeUrl}`,
        `You only pay the difference for the rest of this billing period, and your license key stays the same.`,
        ``,
        `Once you've switched, book your call here: ${v.bookCallUrl}`,
        ``,
        ...(v.upgradePriceLockLine ? [v.upgradePriceLockLine, ``] : []),
        `Want the details first? What changes and how to switch back: ${UPGRADE_GUIDE_URL}`,
        ``,
        `Happy where you are? Nothing changes. Reply any time.`,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
};

function asEntry(c: UpgradeCopy): TrackCopyEntry {
  return { subject: c.subject, updatedAt: "2026-11-08", build: (vars) => c.build(upgradeVarsFrom(vars)) };
}

registerTrackCopy(UPGRADE_FUNNEL, { u1: asEntry(UPGRADE_COPY.u1), u2: asEntry(UPGRADE_COPY.u2) });

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Which step (if any) is due for someone whose paid Beginner plan started at
 * `startedAtMs`, given the tiers already sent. Picks the latest step whose
 * threshold has passed; returns null when that step, or any later one, was
 * already sent (so a backlog never sends u1 after u2). `thresholdsMs` lets the
 * cron apply admin day_offset overrides (tierThresholdMs).
 */
export function selectUpgradeTier(args: {
  startedAtMs: number | null | undefined;
  sent: ReadonlySet<string>;
  now?: number;
  thresholdsMs?: Partial<Record<UpgradeTier, number>>;
}): UpgradeTier | null {
  const { startedAtMs, sent } = args;
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) return null;
  const age = (args.now ?? Date.now()) - startedAtMs;
  for (let i = UPGRADE_TIERS.length - 1; i >= 0; i--) {
    const t = UPGRADE_TIERS[i];
    const threshold = args.thresholdsMs?.[t.tier] ?? t.dayOffset * DAY_MS;
    if (sent.has(t.tier)) return null;
    if (age >= threshold) return t.tier;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Progress table helpers (graceful when 20261109 is not applied)
// ---------------------------------------------------------------------------

type DbError = { code?: string; message?: string } | null | undefined;

function codeOf(error: DbError): string {
  return (error && typeof error.code === "string" && error.code) || "";
}

/** Postgres 42P01 / PostgREST PGRST205: the progress table does not exist. */
export function isMissingTable(error: DbError): boolean {
  const c = codeOf(error);
  return c === "42P01" || c === "PGRST205";
}

/** Postgres 42703 / PostgREST PGRST204: a column does not exist. */
export function isMissingColumn(error: DbError): boolean {
  const c = codeOf(error);
  return c === "42703" || c === "PGRST204";
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Tiers already sent to this person, or null when the progress table is
 * missing / unreadable (the caller must then skip the person). */
export async function loadUpgradeStepsSent(db: SupabaseClient, email: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await db
      .from("email_funnel_step_sends")
      .select("tier")
      .eq("email", normEmail(email))
      .eq("funnel", UPGRADE_FUNNEL);
    if (error) {
      if (!isMissingTable(error)) console.error("upgrade-emails: progress read failed", error);
      return null;
    }
    const out = new Set<string>();
    for (const r of (data ?? []) as { tier?: unknown }[]) if (typeof r.tier === "string") out.add(r.tier);
    return out;
  } catch (err) {
    console.error("upgrade-emails: progress read threw", err);
    return null;
  }
}

type ClaimResult = "claimed" | "already_sent" | "migration_pending" | "failed";

/** Inserts the progress row first (the idempotency lock). */
export async function claimUpgradeStep(
  db: SupabaseClient,
  email: string,
  tier: UpgradeTier,
  stepKey: string,
): Promise<ClaimResult> {
  const row = { email: normEmail(email), funnel: UPGRADE_FUNNEL, tier, step_key: stepKey };
  try {
    let { error } = await db.from("email_funnel_step_sends").insert(row);
    if (error && isMissingColumn(error)) {
      // A hand-built table without step_key: claim without it.
      const { step_key: _omit, ...bare } = row;
      void _omit;
      ({ error } = await db.from("email_funnel_step_sends").insert(bare));
    }
    if (!error) return "claimed";
    if (codeOf(error) === "23505") return "already_sent";
    if (isMissingTable(error)) return "migration_pending";
    console.error("upgrade-emails: claim failed", error);
    return "failed";
  } catch (err) {
    console.error("upgrade-emails: claim threw", err);
    return "failed";
  }
}

/** Removes a claim after a failed send so the next run retries. */
export async function releaseUpgradeStep(db: SupabaseClient, email: string, tier: UpgradeTier): Promise<void> {
  try {
    const { error } = await db
      .from("email_funnel_step_sends")
      .delete()
      .eq("email", normEmail(email))
      .eq("funnel", UPGRADE_FUNNEL)
      .eq("tier", tier);
    if (error) console.error("upgrade-emails: claim release failed", error);
  } catch (err) {
    console.error("upgrade-emails: claim release threw", err);
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export type UpgradeEmailPayload = {
  tier: UpgradeTier;
  to: string;
  name?: string | null;
  upgradeUrl?: string;
  bookCallUrl?: string;
  toolsLine?: string;
  /** Funnels v2 content key, e.g. "u1" or "u1.beginner". Defaults to the tier. */
  contentKey?: string;
  /** Track vars (eventLine etc.) for admin overrides that reference them. */
  trackVars?: Partial<LifecycleTrackVars>;
  /** Injected client (tests); defaults to createAdminClient(). */
  db?: SupabaseClient;
  now?: number;
};

export type UpgradeSendStatus = "sent" | "already_sent" | "migration_pending" | "no_copy" | "failed";
export type UpgradeSendResult = { ok: boolean; status: UpgradeSendStatus; contentKey: string };

/**
 * Sends one upgrade-funnel email at most once per (email, tier).
 *   sent              handled by sendMarketingEmail (delivered, or suppressed and skipped)
 *   already_sent      a progress row exists (another run sent it)
 *   migration_pending email_funnel_step_sends is missing: nothing sent
 *   no_copy           nothing resolved for the key: nothing sent, claim released
 *   failed            claim or send failed: claim released, retry next run
 * `ok` is true for sent and already_sent (the step is done).
 */
export async function sendUpgradeEmail(payload: UpgradeEmailPayload): Promise<UpgradeSendResult> {
  const now = payload.now ?? Date.now();
  const contentKey =
    payload.contentKey && parseContentKey(payload.contentKey)?.tier === payload.tier ? payload.contentKey : payload.tier;
  let db: SupabaseClient;
  try {
    db = payload.db ?? createAdminClient();
  } catch (err) {
    console.error("upgrade-emails: no admin client", err);
    return { ok: false, status: "failed", contentKey };
  }

  const claim = await claimUpgradeStep(db, payload.to, payload.tier, contentKey);
  if (claim === "already_sent") return { ok: true, status: "already_sent", contentKey };
  if (claim === "migration_pending") return { ok: false, status: "migration_pending", contentKey };
  if (claim === "failed") return { ok: false, status: "failed", contentKey };

  const vars = upgradeVarsFrom(
    {
      ...(payload.trackVars ?? {}),
      firstName: (payload.name ?? "").split(" ")[0] || "there",
      upgradeUrl: payload.upgradeUrl,
      bookCallUrl: payload.bookCallUrl,
      toolsLine: payload.toolsLine,
    },
    now,
  );
  const rec = vars as unknown as Record<string, unknown>;
  const bare = (tier: string) => {
    const c = UPGRADE_COPY[tier as UpgradeTier];
    return c ? { subject: c.subject, body: c.build(vars) } : null;
  };

  let ok = false;
  try {
    const overrides = await getFunnelOverrides();
    const resolved = resolveFunnelCopyForKey({
      funnel: UPGRADE_FUNNEL,
      contentKey,
      vars: rec,
      overrides,
      codeDefaultForKey: makeLocalCodeDefault(UPGRADE_FUNNEL, bare, rec),
    });
    if (!resolved.subject || !resolved.body) {
      await releaseUpgradeStep(db, payload.to, payload.tier);
      return { ok: false, status: "no_copy", contentKey };
    }
    // A/B overlay + step tracking (the upgrade funnel only exists under v2).
    const sendCopy = await withFunnelExperiment({
      funnel: UPGRADE_FUNNEL,
      contentKey,
      email: payload.to,
      control: { subject: resolved.subject, body: resolved.body },
      vars: rec,
    });
    ok = await sendMarketingEmail({
      from: FROM_ADDRESS,
      to: payload.to,
      subject: sendCopy.subject,
      text: sendCopy.body,
      category: `upgrade_${payload.tier}`,
      funnel: UPGRADE_FUNNEL as EmailFunnel,
      trackOpens: true,
      ...sendCopy.tracking,
    });
    if (ok && resolved.applyTag) {
      try {
        await tagRecipientsAsContacts(db, [payload.to], resolved.applyTag, "funnel:upgrade");
      } catch (err) {
        console.error("upgrade-emails: tag-on-send failed", err);
      }
    }
  } catch (err) {
    console.error("upgrade-emails: send threw", err);
    ok = false;
  }

  if (!ok) {
    await releaseUpgradeStep(db, payload.to, payload.tier);
    return { ok: false, status: "failed", contentKey };
  }
  return { ok: true, status: "sent", contentKey };
}
