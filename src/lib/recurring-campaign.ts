// Recurring "Group Mirror Butler" campaign: every two weeks, email people who have
// opened any of our emails, have no subscription or trial, and have never been
// sent this series. Runs from the existing email-marketing cron (every 5
// minutes); when a run is due it freezes the recipient list into a normal
// `email_campaigns` row (status 'sending'), and the existing campaign engine
// sends it. Everything is capped and reversible:
//   - paused by default; the admin Campaigns tab has the on/off switch
//   - at most RECURRING_MAX_PER_RUN people per run, most recently engaged first
//   - skips a run when fewer than RECURRING_MIN_TO_SEND people qualify
//   - never emails someone twice (earlier series campaigns are excluded)
//   - drops the "pricing goes up" P.S. once PRICING_NOTE_ENDS_AT has passed
//   - emails the owner a summary after every run
// State lives in app_config (no migration).

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAudience, type Audience } from "@/lib/email-audience";
import { sendEmail } from "@/lib/email-send";
import { FACEBOOK_GROUP_URL } from "@/lib/social";

export const RECURRING_CONFIG_KEY = "recurring_group_mirror";
export const RECURRING_EVERY_DAYS = 14;
export const RECURRING_MAX_PER_RUN = 1500;
export const RECURRING_MIN_TO_SEND = 25;
/** First automatic run: Monday Oct 26 2026, 5:00 PM MDT (the evening hour that worked). */
export const RECURRING_FIRST_RUN_AT = "2026-10-26T23:00:00.000Z";
/** Dec 1 2026, 00:00 Mountain (MST, UTC-7). Sends on or after this drop the pricing P.S. */
export const PRICING_NOTE_ENDS_AT = "2026-12-01T07:00:00.000Z";
export const RECURRING_SUBJECT =
  "Someone asked for a feature at lunch. It shipped before the game ended.";

/** Campaigns already sent (or about to be) in this series; their recipients are never re-emailed. */
export const RECURRING_SERIES_SEED = [
  "7c71e6d3-102b-4b84-8570-72eeea0e4939", // first send, 3+ openers
  "377f929d-c5fe-47f2-ac88-407aa4d0c486", // 1-2 openers, half A
  "b47dc38f-9a73-4524-8279-02838f563f3f", // 1-2 openers, half B
  "e42e63da-70ef-4381-bc68-549ac5e89338", // resend to non-openers
];

const HISTORY_LIMIT = 12;
const DAY_MS = 86_400_000;
const FROM_ADDRESS = "Influencer Butler <alerts@influencerbutler.com>";
const ADMIN_EMAILS_URL = "https://www.influencerbutler.com/dashboard/admin/emails";

export type RecurringRun = {
  at: string;
  campaignId: string | null;
  recipients: number;
  outcome: "sent" | "skipped_too_few" | "error";
  note?: string;
};

export type RecurringState = {
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastCampaignId: string | null;
  seriesCampaignIds: string[];
  history: RecurringRun[];
};

export type RecurringRunResult =
  | { ran: false; reason: "disabled" | "not_due" | "claim_failed" }
  | { ran: true; outcome: RecurringRun["outcome"]; campaignId: string | null; recipients: number };

export function defaultRecurringState(): RecurringState {
  return {
    enabled: false,
    nextRunAt: RECURRING_FIRST_RUN_AT,
    lastRunAt: null,
    lastCampaignId: null,
    seriesCampaignIds: [...RECURRING_SERIES_SEED],
    history: [],
  };
}

/** True while the "pricing goes up" P.S. should still appear. */
export function includePricingNote(now: Date): boolean {
  return now.getTime() < Date.parse(PRICING_NOTE_ENDS_AT);
}

/** Unique link tag per run so download clicks never mix between sends. */
export function recurringSrcTag(now: Date): string {
  return `group-mirror-auto-${now.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/**
 * The next run time after `nowMs`, stepping from the slot that was due so runs
 * stay anchored to the same hour of day and a late cron tick never drifts them.
 */
export function advanceRunTime(dueMs: number, nowMs: number, everyDays: number): number {
  const step = everyDays * DAY_MS;
  let next = dueMs + step;
  while (next <= nowMs) next += step;
  return next;
}

/** The email body for one run (formatted markup; see campaign-email.ts). */
export function buildRecurringBody(srcTag: string, withPricingNote: boolean): string {
  const facebookLink = `Come hang out with us in the Influencer Butler Facebook group: [Join the group](${FACEBOOK_GROUP_URL})`;
  const tail = withPricingNote
    ? [
        "P.S. **Pro pricing goes up at the end of November**, so now is a great time to grab today's price.",
        `P.P.S. ${facebookLink}`,
      ]
    : [`P.S. ${facebookLink}`];
  return [
    "Hi there,",
    "# Someone asked for a new Butler this afternoon. It was built and tested before the baseball game ended.",
    "A member told us in the Pro Lounge that her group admins post deals in a Facebook group, and she wanted every one of them to land in Telegram automatically. We passed it to the team, and within the hour it was ready. (I watched my son's baseball game the whole time.)",
    "It's called **Group Mirror Butler**. It lives inside your Telegram Butler, and it's in the latest release.",
    "**That's how we work: you tell us what you need, and we build it.**",
    [
      "- You send us a request, like the one above",
      "- Pro requests go first, and some are built within a day",
      "- You can even make a request during your 14-day trial, depending on the current request log",
    ].join("\n"),
    "You could hire a developer for thousands of dollars and wait weeks. Or you can be a Pro member for $39/month (less with an affiliate promo code).",
    `[Try Pro free for 14 days](https://www.influencerbutler.com/go/download?src=${srcTag})`,
    "- The Influencer Butler team",
    ...tail,
  ].join("\n\n");
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Reads the state, merging stored values over the defaults. Never throws. */
export async function readRecurringState(db: SupabaseClient): Promise<RecurringState> {
  const base = defaultRecurringState();
  try {
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", RECURRING_CONFIG_KEY)
      .maybeSingle();
    if (error || !data?.value || typeof data.value !== "object") return base;
    const v = data.value as Record<string, unknown>;
    const stored = Array.isArray(v.seriesCampaignIds)
      ? v.seriesCampaignIds.filter((x): x is string => typeof x === "string")
      : [];
    return {
      enabled: v.enabled === true,
      nextRunAt: asString(v.nextRunAt) ?? base.nextRunAt,
      lastRunAt: asString(v.lastRunAt),
      lastCampaignId: asString(v.lastCampaignId),
      seriesCampaignIds: [...new Set([...RECURRING_SERIES_SEED, ...stored])],
      history: Array.isArray(v.history) ? (v.history as RecurringRun[]).slice(-HISTORY_LIMIT) : [],
    };
  } catch {
    return base;
  }
}

async function writeRecurringState(
  db: SupabaseClient,
  state: RecurringState,
  updatedBy: string,
): Promise<boolean> {
  const { error } = await db.from("app_config").upsert(
    {
      key: RECURRING_CONFIG_KEY,
      value: state,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" },
  );
  if (error) console.error("recurring-campaign: state write failed", error);
  return !error;
}

/**
 * Turns the series on or off (admin switch). Turning it on never fires a run
 * right away: if the stored next-run time has already passed, it moves to the
 * next scheduled slot.
 */
export async function setRecurringEnabled(
  db: SupabaseClient,
  enabled: boolean,
  updatedBy: string,
  now: Date = new Date(),
): Promise<RecurringState | null> {
  const state = await readRecurringState(db);
  const due = Date.parse(state.nextRunAt);
  const nextRunAt =
    enabled && Number.isFinite(due) && due <= now.getTime()
      ? new Date(advanceRunTime(due, now.getTime(), RECURRING_EVERY_DAYS)).toISOString()
      : state.nextRunAt;
  const next: RecurringState = { ...state, enabled, nextRunAt };
  return (await writeRecurringState(db, next, updatedBy)) ? next : null;
}

function ownerRecipients(): string[] {
  const raw = process.env.PAYOUT_DIGEST_INBOX || process.env.ADMIN_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function notifyOwner(run: RecurringRun, nextRunAt: string): Promise<void> {
  const to = ownerRecipients();
  if (to.length === 0) return;
  const headline =
    run.outcome === "sent"
      ? `Group Mirror auto-send queued for ${run.recipients.toLocaleString("en-US")} people`
      : run.outcome === "skipped_too_few"
        ? `Group Mirror auto-send skipped: only ${run.recipients} new openers`
        : "Group Mirror auto-send failed";
  const lines = [
    headline,
    run.note ? run.note : "",
    run.campaignId ? `Campaign: ${ADMIN_EMAILS_URL} (open Campaigns, "Group Mirror Butler - auto")` : "",
    `Next run: ${nextRunAt}`,
    `Pause or resume it in the Campaigns tab: ${ADMIN_EMAILS_URL}`,
  ].filter(Boolean);
  for (const recipient of to) {
    await sendEmail({
      from: FROM_ADDRESS,
      to: recipient,
      subject: headline,
      text: lines.join("\n\n"),
      category: "recurring_campaign_summary",
      funnel: "transactional",
    });
  }
}

/**
 * Runs the series if it is enabled and due. Safe to call every few minutes: it
 * claims the slot (advances nextRunAt with a compare-and-set) BEFORE creating
 * the campaign, so two overlapping cron ticks, a retry, or a crash can never
 * send the same run twice. Never throws.
 */
export async function runRecurringIfDue(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<RecurringRunResult> {
  const state = await readRecurringState(db);
  if (!state.enabled) return { ran: false, reason: "disabled" };
  const due = Date.parse(state.nextRunAt);
  if (!Number.isFinite(due) || now.getTime() < due) return { ran: false, reason: "not_due" };

  const nextRunAt = new Date(advanceRunTime(due, now.getTime(), RECURRING_EVERY_DAYS)).toISOString();
  const claimed = await db
    .from("app_config")
    .update({
      value: { ...state, nextRunAt, lastRunAt: now.toISOString() },
      updated_at: now.toISOString(),
      updated_by: "cron:recurring-campaign",
    })
    .eq("key", RECURRING_CONFIG_KEY)
    .eq("value->>nextRunAt", state.nextRunAt)
    .select("key");
  if (claimed.error || !claimed.data || claimed.data.length === 0) {
    return { ran: false, reason: "claim_failed" };
  }

  const finish = async (run: RecurringRun): Promise<RecurringRunResult> => {
    const fresh = await readRecurringState(db);
    const series =
      run.campaignId && !fresh.seriesCampaignIds.includes(run.campaignId)
        ? [...fresh.seriesCampaignIds, run.campaignId]
        : fresh.seriesCampaignIds;
    await writeRecurringState(
      db,
      {
        ...fresh,
        seriesCampaignIds: series,
        lastCampaignId: run.campaignId ?? fresh.lastCampaignId,
        history: [...fresh.history, run].slice(-HISTORY_LIMIT),
      },
      "cron:recurring-campaign",
    );
    try {
      await notifyOwner(run, nextRunAt);
    } catch (err) {
      console.error("recurring-campaign: owner notification failed", err);
    }
    return { ran: true, outcome: run.outcome, campaignId: run.campaignId, recipients: run.recipients };
  };

  try {
    const audience: Audience = {
      kind: "opened_nonpaid",
      minOpens: 1,
      excludeCampaignIds: state.seriesCampaignIds,
    };
    const { emails, migrationPending } = await resolveAudience(db, audience);
    if (migrationPending) {
      return finish({
        at: now.toISOString(),
        campaignId: null,
        recipients: 0,
        outcome: "error",
        note: "Could not resolve the audience (a lookup failed), so nothing was sent.",
      });
    }
    if (emails.length < RECURRING_MIN_TO_SEND) {
      return finish({
        at: now.toISOString(),
        campaignId: null,
        recipients: emails.length,
        outcome: "skipped_too_few",
        note: `Fewer than ${RECURRING_MIN_TO_SEND} new openers, so this run was skipped. The next run will include them.`,
      });
    }

    const chosen = emails.slice(0, RECURRING_MAX_PER_RUN);
    const row = {
      name: `Group Mirror Butler - auto ${now.toISOString().slice(0, 10)}`,
      subject: RECURRING_SUBJECT,
      body: buildRecurringBody(recurringSrcTag(now), includePricingNote(now)),
      audience: { kind: "pasted", emails: chosen },
      status: "sending",
      created_by: "auto:recurring",
    };
    let { data, error } = await db
      .from("email_campaigns")
      .insert({ ...row, stream: "lifecycle" })
      .select("id")
      .single();
    if (error) {
      // The optional stream column may not exist yet; retry with the base columns.
      ({ data, error } = await db.from("email_campaigns").insert(row).select("id").single());
    }
    if (error || !data) {
      console.error("recurring-campaign: campaign insert failed", error);
      return finish({
        at: now.toISOString(),
        campaignId: null,
        recipients: 0,
        outcome: "error",
        note: "Could not create the campaign, so nothing was sent.",
      });
    }
    return finish({
      at: now.toISOString(),
      campaignId: data.id as string,
      recipients: chosen.length,
      outcome: "sent",
      note:
        emails.length > chosen.length
          ? `${emails.length - chosen.length} more qualified and will be included in a later run (cap ${RECURRING_MAX_PER_RUN}).`
          : undefined,
    });
  } catch (err) {
    console.error("recurring-campaign: run threw", err);
    return finish({
      at: now.toISOString(),
      campaignId: null,
      recipients: 0,
      outcome: "error",
      note: "Unexpected error, so nothing was sent.",
    });
  }
}
