/**
 * App-trial "your own posts" summary: counts the desktop app reports for a
 * trial user (their own Storefront Butler posts with a live deal, a live
 * shopping-event deal, or an open Creator Connections campaign), stored on
 * their email_subscribers row and used as one line in the day 12 "2 days left"
 * email.
 *
 * Counts only, by design (owner decision 2026-11-14): a trial user has no
 * account, so the upload cannot be proven to come from them. Nothing the upload
 * carries can put a link, a product name or free text into our email: numbers
 * are clamped, the event label must be one we know, and the line is built here.
 * Amazon deals are counted only once live (the app applies that rule); the
 * line says when the app checked and is dropped when the check is stale.
 */

export type AppTrialPostsSummary = {
  deals: number;
  campaigns: number;
  event: number;
  eventLabel: string;
  bestPerSale: number | null;
};

/** Event names the line may use (the app's short labels). Anything else is dropped. */
const EVENT_LABELS = ["Black Friday", "Cyber Monday", "Prime Day", "Prime Big Deal Days"];
const MAX_COUNT = 500;
/** A check older than this is not quoted in an email. */
export const POSTS_SUMMARY_MAX_AGE_MS = 72 * 3600 * 1000;

function count(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_COUNT) : 0;
}

/** Validate an upload; null when there is nothing worth storing. */
export function normalizePostsSummary(raw: unknown): AppTrialPostsSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.eventLabel === "string" ? o.eventLabel.trim() : "";
  const best = Number(o.bestPerSale);
  return {
    deals: count(o.deals),
    campaigns: count(o.campaigns),
    event: count(o.event),
    eventLabel: EVENT_LABELS.includes(label) ? label : "",
    bestPerSale: Number.isFinite(best) && best > 0 && best < 1000 ? Math.round(best * 100) / 100 : null,
  };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The day 12 line, or "" when there is no fresh, non-empty summary.
 * Plain text, no em-dash, no links (the email's own CTA points at the app).
 */
export function postsLineFor(
  summary: AppTrialPostsSummary | null,
  checkedAt: string | null,
  now = Date.now(),
): string {
  if (!summary) return "";
  const at = Date.parse(checkedAt || "");
  if (!Number.isFinite(at) || now - at > POSTS_SUMMARY_MAX_AGE_MS) return "";
  const parts: string[] = [];
  if (summary.event > 0 && summary.eventLabel) {
    parts.push(`${summary.event} ${plural(summary.event, "was", "were")} in ${summary.eventLabel} deals`);
  }
  const otherDeals = Math.max(0, summary.deals - (summary.eventLabel ? summary.event : 0));
  if (otherDeals > 0) parts.push(`${otherDeals} ${plural(otherDeals, "was", "were")} on sale`);
  if (summary.campaigns > 0) {
    parts.push(
      `${summary.campaigns} ${plural(summary.campaigns, "had an open Creator Connections campaign", "had open Creator Connections campaigns")} (those are for Gold and Platinum creators)`,
    );
  }
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const best = summary.bestPerSale != null ? ` The best one earns about $${summary.bestPerSale.toFixed(2)} per sale.` : "";
  return `When your app last checked your storefront, ${list}.${best} Open Influencer Butler and the Home screen has a caption ready for each one, linked to your own post.`;
}
