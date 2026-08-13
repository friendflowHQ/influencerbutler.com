// Monthly affiliate swipe-kit broadcast.
//
// Keeps the affiliate army posting without any founder effort: once a month the
// affiliate-swipe-kit cron emails every active affiliate a rotating set of
// ready-to-post content pulled from the Content Planner (engagementPosts.ts),
// with their own branded share link dropped in. Different butlers each month, so
// over a year every affiliate cycles through the whole library.
//
// Plain text, marketing voice, sent via sendMarketingEmail (suppression +
// unsubscribe) because it is recurring promotional content. Names no
// competitors (repo copy rule), no em dashes.

import { BUTLERS, type ButlerGroup } from "@/app/dashboard/affiliates/planner/engagementPosts";
import { affiliateShareLink } from "@/lib/affiliate-resources-email";
import { sendMarketingEmail } from "@/lib/marketing-email";

const SITE = "https://www.influencerbutler.com";
export const SWIPE_KIT_FROM = "Influencer Butler <affiliates@influencerbutler.com>";
const CONFIG_KEY = "affiliate_swipe_kit";
const PER_RUN_LIMIT = 1000;

/** Current billing-agnostic period key, e.g. "2026-08". */
export function currentPeriod(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Stable integer for a "YYYY-MM" period so butler selection rotates monthly. */
function periodIndex(period: string): number {
  const [yStr, mStr] = period.split("-");
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  return y * 12 + (m - 1);
}

/**
 * Picks `count` butlers for the month, walking the library by period so each
 * month features a fresh, non-overlapping set and every butler comes up over
 * time. Deterministic (no Math.random) so a re-run in the same month is stable.
 */
export function pickButlersForPeriod(period: string, count = 3): ButlerGroup[] {
  const total = BUTLERS.length;
  if (total === 0) return [];
  const n = Math.min(count, total);
  const start = (periodIndex(period) * n) % total;
  const out: ButlerGroup[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(BUTLERS[(start + i) % total]);
  }
  return out;
}

export type SwipeKitEmail = { subject: string; text: string };

/**
 * Builds one affiliate's monthly kit: 2 ready posts per featured butler
 * (screenshot idea + copy-paste caption), their branded link, and a nudge to
 * the planner + competitor playbook for more.
 */
export function buildSwipeKitEmail(params: {
  name: string | null;
  brandedCode: string | null;
  period: string;
  butlers: ButlerGroup[];
  postsPerButler?: number;
}): SwipeKitEmail {
  const firstName = (params.name ?? "").split(" ")[0] || "there";
  const perButler = params.postsPerButler ?? 2;
  const shareLink = params.brandedCode
    ? affiliateShareLink(params.brandedCode)
    : `${SITE}/dashboard/affiliates`;

  const lines: string[] = [
    `Hi ${firstName},`,
    ``,
    `Here is this month's ready-to-post kit. Everything below is copy-paste ready: grab a caption, screenshot the butler it names, add your link, and post. No writing required.`,
    ``,
    params.brandedCode
      ? `Your link (already has your code applied): ${shareLink}`
      : `Your dashboard has your link and code: ${SITE}/dashboard/affiliates`,
    ``,
    `--------------------------------------------------`,
    ``,
  ];

  for (const butler of params.butlers) {
    lines.push(`### ${butler.name}`, butler.blurb, ``);
    const posts = butler.posts.slice(0, perButler);
    posts.forEach((post, i) => {
      lines.push(
        `Post ${i + 1}: ${post.title}`,
        `Screenshot idea: ${post.screenshot}`,
        `Caption:`,
        post.caption,
        ``,
      );
    });
    lines.push(`--------------------------------------------------`, ``);
  }

  lines.push(
    `Want more? Your full library (hooks, captions, a 14-day launch calendar, and ready-made graphics) is in the Content Planner: ${SITE}/dashboard/affiliates/planner`,
    ``,
    `And for head-to-head posts, the Competitor Playbook on your dashboard has safe, copy-paste comparisons.`,
    ``,
    `Post one this week and watch your link clicks. Every subscription your link brings in earns you recurring commission, tracked to you automatically.`,
    ``,
    `At your service,`,
    `The Influencer Butler`,
  );

  return {
    subject: `Your ${monthLabel(params.period)} post kit: ${params.butlers.map((b) => b.name).join(", ")}`,
    text: lines.join("\n"),
  };
}

function monthLabel(period: string): string {
  const [yStr, mStr] = period.split("-");
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const name = months[m - 1] ?? "";
  return name ? `${name} ${y}` : period;
}

// --- Broadcast runner -----------------------------------------------------
//
// Shared by the manual-trigger route (/api/cron/affiliate-swipe-kit) and the
// affiliate-funnel cron's monthly step. The app_config guard makes it send at
// most once per calendar month regardless of how often it is called, so it is
// safe to invoke from the 5-minute funnel cron: nearly every call is a single
// cheap app_config read that returns "already sent".

// Minimal Supabase shape this runner needs. Both callers pass a service-role
// createServerClient, cast to this.
export type SwipeKitDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => Promise<{ data: unknown[] | null; error: unknown }> & {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
      in: (col: string, vals: unknown[]) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

export type SwipeKitResult = {
  ok: boolean;
  period: string;
  skipped?: string;
  affiliates?: number;
  sent?: number;
  butlers?: string[];
};

async function readLastPeriod(db: SwipeKitDb): Promise<string | null> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", CONFIG_KEY).maybeSingle();
    const v = (data?.value && typeof data.value === "object" ? data.value : {}) as Record<string, unknown>;
    return typeof v.last_period === "string" ? v.last_period : null;
  } catch {
    return null;
  }
}

async function writeLastPeriod(db: SwipeKitDb, period: string, sent: number): Promise<void> {
  const { error } = await db.from("app_config").upsert(
    {
      key: CONFIG_KEY,
      value: { last_period: period, last_sent_count: sent, last_sent_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
      updated_by: "cron:affiliate-swipe-kit",
    },
    { onConflict: "key" },
  );
  if (error) console.error("swipe-kit: app_config write failed", error);
}

/**
 * Sends this month's kit to every active affiliate, at most once per calendar
 * month (app_config guard). `now` is injected so callers control the clock.
 */
export async function runSwipeKitBroadcast(db: SwipeKitDb, now: Date): Promise<SwipeKitResult> {
  const period = currentPeriod(now);

  const last = await readLastPeriod(db);
  if (last === period) {
    return { ok: true, period, skipped: "already-sent-this-period" };
  }

  const { data: appsData, error: appsError } = await db
    .from("affiliate_applications")
    .select("user_id,email,full_name")
    .eq("status", "approved");
  if (appsError) {
    console.error("swipe-kit: applications query failed", appsError);
    return { ok: false, period };
  }

  const apps = ((appsData ?? []) as { user_id?: string; email?: string; full_name?: string }[])
    .filter((a) => a.user_id && a.email)
    .slice(0, PER_RUN_LIMIT);
  if (apps.length === 0) {
    await writeLastPeriod(db, period, 0);
    return { ok: true, period, affiliates: 0, sent: 0 };
  }

  const userIds = apps.map((a) => a.user_id as string);
  const codeByUser = new Map<string, string | null>();
  const { data: profData } = await db.from("profiles").select("id,affiliate_code").in("id", userIds);
  for (const row of (profData ?? []) as { id?: string; affiliate_code?: string | null }[]) {
    if (row.id) codeByUser.set(row.id, row.affiliate_code ?? null);
  }

  const butlers = pickButlersForPeriod(period, 3);

  let sent = 0;
  const seen = new Set<string>();
  for (const app of apps) {
    const email = (app.email as string).trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const { subject, text } = buildSwipeKitEmail({
      name: app.full_name ?? null,
      brandedCode: codeByUser.get(app.user_id as string) ?? null,
      period,
      butlers,
    });
    const ok = await sendMarketingEmail({ from: SWIPE_KIT_FROM, to: email, subject, text });
    if (ok) sent += 1;
  }

  await writeLastPeriod(db, period, sent);

  return { ok: true, period, affiliates: seen.size, sent, butlers: butlers.map((b) => b.name) };
}
