/**
 * Extend a Lemon Squeezy trial by N days, keeping the card on file.
 *
 * This does NOT touch the payment method: it only moves the subscription's
 * `trial_ends_at` forward, delaying the first charge. The subscription stays
 * `on_trial` and the saved card is charged when the (new) trial ends.
 *
 * The LS dashboard has no button for this, so we PATCH the subscription
 * directly. We GET the current trial_ends_at first, add the days, then PATCH,
 * so we never guess the time-of-day.
 *
 * Usage (PowerShell):
 *   $env:LEMONSQUEEZY_API_KEY="..."; node scripts/extend-trial.mjs 2390366 7
 *   $env:LEMONSQUEEZY_API_KEY="..."; node scripts/extend-trial.mjs 2390366 7 --apply
 *
 * Usage (bash):
 *   LEMONSQUEEZY_API_KEY=... node scripts/extend-trial.mjs 2390366 7
 *   LEMONSQUEEZY_API_KEY=... node scripts/extend-trial.mjs 2390366 7 --apply
 *
 * Without --apply it is a dry run: it prints the current and proposed dates and
 * changes nothing.
 */

const API = "https://api.lemonsqueezy.com/v1";
const KEY = process.env.LEMONSQUEEZY_API_KEY;

const [, , subId, daysArg, ...rest] = process.argv;
const days = Number(daysArg);
const apply = rest.includes("--apply");

if (!KEY) {
  console.error("Missing LEMONSQUEEZY_API_KEY environment variable.");
  process.exit(1);
}
if (!subId || !Number.isInteger(days) || days < 1) {
  console.error("Usage: node scripts/extend-trial.mjs <subscriptionId> <days> [--apply]");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
};

const getRes = await fetch(`${API}/subscriptions/${subId}`, { headers });
if (!getRes.ok) {
  console.error(`GET subscription failed: ${getRes.status}`, (await getRes.text()).slice(0, 500));
  process.exit(1);
}
const sub = await getRes.json();
const attrs = sub.data?.attributes ?? {};
const status = attrs.status;
const currentTrial = attrs.trial_ends_at;

console.log(`Subscription ${subId}`);
console.log(`  customer:   ${attrs.user_email ?? "?"}`);
console.log(`  status:     ${status}`);
console.log(`  trial ends: ${currentTrial ?? "(none)"}`);

if (status !== "on_trial" || !currentTrial) {
  console.error("\nNot on an active trial (no trial_ends_at), so there is nothing to extend. Aborting.");
  process.exit(1);
}

const newTrial = new Date(new Date(currentTrial).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
console.log(`  new trial:  ${newTrial}  (+${days} days)`);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to save this change.");
  process.exit(0);
}

const patchRes = await fetch(`${API}/subscriptions/${subId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    data: { type: "subscriptions", id: String(subId), attributes: { trial_ends_at: newTrial } },
  }),
});
if (!patchRes.ok) {
  console.error(`\nPATCH failed: ${patchRes.status}`, (await patchRes.text()).slice(0, 500));
  process.exit(1);
}
const updated = await patchRes.json();
console.log(`\nDone. trial_ends_at is now ${updated.data?.attributes?.trial_ends_at}`);
