/**
 * Summary: Finds users who have more than one LIVE Lemon Squeezy subscription
 *   (active / on_trial) and cancels the redundant TRIALS, so a pile of
 *   overlapping free trials can't each convert into its own paid charge. This is
 *   the one-off cleanup counterpart to the checkout double-subscribe guard
 *   (src/app/api/checkout/route.ts) and the webhook supersede logic
 *   (subscription_created -> supersedeStaleTrials): the guard/webhook stop NEW
 *   duplicates; this script mops up the ones already stacked.
 *
 *   Safe by default: it only CANCELS trials, never a paid 'active' subscription,
 *   and never the Deals add-on. It is a DRY RUN unless you pass --apply.
 *   Cancelling in LS (DELETE) stops a trial converting; your production
 *   subscription_cancelled webhook then reconciles the subscriptions table, so
 *   this script deliberately does NOT touch the database.
 *
 * Usage (dry run first, always):
 *   LEMONSQUEEZY_API_KEY=... node scripts/cleanup-duplicate-subscriptions.mjs
 *   LEMONSQUEEZY_API_KEY=... node scripts/cleanup-duplicate-subscriptions.mjs --email=someone@example.com
 *   LEMONSQUEEZY_API_KEY=... node scripts/cleanup-duplicate-subscriptions.mjs --apply
 *
 * On Windows PowerShell:
 *   $env:LEMONSQUEEZY_API_KEY="..."; node scripts/cleanup-duplicate-subscriptions.mjs
 *   $env:LEMONSQUEEZY_API_KEY="..."; node scripts/cleanup-duplicate-subscriptions.mjs --email=someone@example.com --apply
 *
 * Flags:
 *   --email=<addr>  Only inspect this customer's subscriptions (recommended for
 *                   the first real run: verify one account before a full sweep).
 *   --apply         Actually cancel the flagged trials. Without this, the script
 *                   only prints what it WOULD cancel.
 *
 * Env:
 *   LEMONSQUEEZY_API_KEY                    (required)
 *   LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON  (optional) - the add-on variant id,
 *                   so the additive Deals sub is never treated as a
 *                   duplicate. If unset, add-ons are identified only by their
 *                   status (they are 'active', never a trial, so trials are
 *                   still safe to cancel either way).
 *
 * Dependencies: Node 18+ for global fetch. No npm installs, no DB access.
 */

const LS_API_BASE_URL = "https://api.lemonsqueezy.com/v1";

const API_KEY = process.env.LEMONSQUEEZY_API_KEY;
if (!API_KEY) {
  console.error("Missing LEMONSQUEEZY_API_KEY environment variable.");
  process.exit(1);
}

const ADDON_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON
  ? String(process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON)
  : null;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const emailArg = args.find((a) => a.startsWith("--email="));
const ONLY_EMAIL = emailArg ? emailArg.slice("--email=".length).trim().toLowerCase() : null;

const LIVE_STATUSES = new Set(["active", "on_trial"]);

function lsHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pages through /subscriptions and returns every subscription record. LS returns
 * 404/other on error; we surface that loudly rather than silently cleaning up a
 * partial list (a partial list could make a real duplicate look unique).
 */
async function fetchAllSubscriptions() {
  const all = [];
  let pageNumber = 1;
  const pageSize = 100;

  for (;;) {
    const params = new URLSearchParams();
    if (ONLY_EMAIL) params.set("filter[user_email]", ONLY_EMAIL);
    params.set("page[size]", String(pageSize));
    params.set("page[number]", String(pageNumber));

    const res = await fetch(`${LS_API_BASE_URL}/subscriptions?${params.toString()}`, {
      method: "GET",
      headers: lsHeaders(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LS subscriptions list failed (page ${pageNumber}, status ${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const payload = await res.json();
    const data = Array.isArray(payload.data) ? payload.data : [];
    all.push(...data);

    const lastPage = payload.meta?.page?.lastPage ?? pageNumber;
    if (pageNumber >= lastPage || data.length === 0) break;
    pageNumber += 1;
    await sleep(250); // be gentle on the LS rate limit
  }

  return all;
}

function isAddon(sub) {
  return ADDON_VARIANT_ID != null && String(sub.attributes?.variant_id) === ADDON_VARIANT_ID;
}

/** active beats on_trial; newer beats older. Higher score = keep. */
function keepScore(sub) {
  const statusRank = sub.attributes?.status === "active" ? 1_000_000_000_000_000 : 0;
  const created = sub.attributes?.created_at ? new Date(sub.attributes.created_at).getTime() : 0;
  return statusRank + created;
}

async function cancelSubscription(id) {
  const res = await fetch(`${LS_API_BASE_URL}/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: lsHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`cancel ${id} failed (status ${res.status}): ${text.slice(0, 300)}`);
  }
}

async function main() {
  console.log(
    `Mode: ${APPLY ? "APPLY (will cancel trials)" : "DRY RUN (no changes)"}` +
      `${ONLY_EMAIL ? ` | email=${ONLY_EMAIL}` : " | all customers"}`,
  );

  const subs = await fetchAllSubscriptions();
  console.log(`Fetched ${subs.length} subscription(s) from Lemon Squeezy.`);

  // Group by customer email (fall back to customer_id when email is absent).
  const byCustomer = new Map();
  for (const sub of subs) {
    const key =
      (sub.attributes?.user_email && String(sub.attributes.user_email).toLowerCase()) ||
      `customer:${sub.attributes?.customer_id ?? "unknown"}`;
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key).push(sub);
  }

  let customersWithDupes = 0;
  let trialsFlagged = 0;
  let trialsCancelled = 0;
  let cancelErrors = 0;

  for (const [customer, group] of byCustomer) {
    // Live, non-addon subscriptions only. One of these is legitimate; extras
    // that are trials are the cleanup targets.
    const live = group.filter((s) => LIVE_STATUSES.has(s.attributes?.status) && !isAddon(s));
    if (live.length <= 1) continue;

    customersWithDupes += 1;

    // Keep the strongest (an active paid sub if any, else the newest trial).
    const keep = live.reduce((best, s) => (keepScore(s) > keepScore(best) ? s : best), live[0]);

    // Only trials are ever cancelled. A second *active* (paid) sub is left alone
    // and reported, so a human decides - auto-cancelling a paying sub is unsafe.
    const trialsToCancel = live.filter((s) => s !== keep && s.attributes?.status === "on_trial");
    const activeExtras = live.filter((s) => s !== keep && s.attributes?.status === "active");

    console.log(`\n${customer}: ${live.length} live subs`);
    console.log(
      `  keep : ${keep.id} [${keep.attributes?.status}] ${keep.attributes?.product_name ?? keep.attributes?.variant_name ?? ""}`,
    );
    for (const extra of activeExtras) {
      console.log(
        `  KEEP (2nd active - needs manual review): ${extra.id} [active] ${extra.attributes?.product_name ?? ""}`,
      );
    }

    for (const trial of trialsToCancel) {
      trialsFlagged += 1;
      console.log(`  cancel: ${trial.id} [on_trial] created ${trial.attributes?.created_at ?? "?"}`);
      if (APPLY) {
        try {
          await cancelSubscription(trial.id);
          trialsCancelled += 1;
          await sleep(300);
        } catch (err) {
          cancelErrors += 1;
          console.error(`  ! ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  console.log(
    `\nDone. customers-with-duplicates=${customersWithDupes} trials-flagged=${trialsFlagged}` +
      (APPLY ? ` trials-cancelled=${trialsCancelled} cancel-errors=${cancelErrors}` : " (dry run)"),
  );
  if (!APPLY && trialsFlagged > 0) {
    console.log("Re-run with --apply to cancel the flagged trials.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
