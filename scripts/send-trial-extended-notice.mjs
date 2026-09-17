/**
 * One-off: email a customer the "your trial has been extended" notice, matching
 * the copy the new admin Extend-trial route sends. Use this when a trial was
 * extended out-of-band (e.g. by hand in the Lemon Squeezy API) and the customer
 * still needs the notice, without re-running the extend (which would add more
 * time).
 *
 * It reads the Resend key and transactional from-address from
 * .env.production.local (server env is not in process.env locally), so no
 * secrets are passed on the command line.
 *
 * Usage (dry run prints the email and changes nothing):
 *   node scripts/send-trial-extended-notice.mjs
 * Send for real:
 *   node scripts/send-trial-extended-notice.mjs --apply
 * Override the defaults if reusing for someone else:
 *   node scripts/send-trial-extended-notice.mjs --to a@b.com --plan "Pro Solo Monthly" --date "December 25, 2026" --months 3 --apply
 */

import { readFileSync } from "node:fs";

// Defaults for the case that prompted this: smartsasssavings@gmail.com, whose
// Pro Solo Monthly trial was extended by 3 months to 25 Dec 2026.
const defaults = {
  to: "smartsasssavings@gmail.com",
  plan: "Pro Solo Monthly",
  date: "December 25, 2026",
  months: "3",
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const apply = process.argv.includes("--apply");
const to = arg("to", defaults.to);
const plan = arg("plan", defaults.plan);
const date = arg("date", defaults.date);
const months = Number(arg("months", defaults.months));

// Load .env.production.local into a lookup.
const env = {};
try {
  for (const line of readFileSync(".env.production.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
} catch (err) {
  console.error("Could not read .env.production.local:", err.message);
  process.exit(1);
}

const key = env.RESEND_API_KEY_TRANSACTIONAL || env.RESEND_API_KEY;
const from = env.EMAIL_FROM_TRANSACTIONAL || "Influencer Butler <hello@influencerbutler.com>";
if (!key) {
  console.error("No RESEND_API_KEY_TRANSACTIONAL or RESEND_API_KEY in .env.production.local.");
  process.exit(1);
}

const monthsLabel = months === 1 ? "1 month" : `${months} months`;
const subject = "Your Influencer Butler trial has been extended";
const text = [
  `Hi there,`,
  ``,
  `Good news: we have extended your Influencer Butler free trial.`,
  ``,
  `  Plan: ${plan}`,
  `  New trial end date: ${date}`,
  `  Extra time added: ${monthsLabel}`,
  ``,
  `You will not be charged until your new trial end date, and there is`,
  `nothing you need to do. Your account and all Pro features stay active`,
  `in the meantime.`,
  ``,
  `Questions, or want to make a change? Just reply to this email and we`,
  `will help.`,
  ``,
  `- The Influencer Butler team`,
].join("\n");

// Same shape as bodyToHtml() in src/lib/newsletter.ts.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html =
  `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#111827;max-width:560px;">` +
  text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n") +
  `</div>`;

console.log(`From:    ${from}`);
console.log(`To:      ${to}`);
console.log(`Subject: ${subject}`);
console.log(`\n${text}\n`);

if (!apply) {
  console.log("Dry run. Re-run with --apply to send.");
  process.exit(0);
}

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from, to, subject, text, html }),
});
if (!res.ok) {
  console.error(`\nSend failed: ${res.status}`, (await res.text()).slice(0, 500));
  process.exit(1);
}
const json = await res.json();
console.log(`\nSent. Resend message id: ${json.id ?? JSON.stringify(json)}`);
