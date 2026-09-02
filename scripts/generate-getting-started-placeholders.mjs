/**
 * Renders scripts/assets/cloud-pc-placeholder.html once per image into branded
 * PNGs for two blog posts:
 *   - "The Daily Influencer Butler Checklist" (daily-influencer-butler-checklist)
 *   - "How to Get Started With Influencer Butler" (how-to-get-started-with-influencer-butler)
 * Uses the locally installed Chrome/Edge in headless mode (same approach as
 * generate-cloud-pc-placeholders.mjs). No npm dependencies.
 *
 * Usage: node scripts/generate-getting-started-placeholders.mjs
 *
 * The two hero covers are branded images meant to keep. The step images are
 * placeholders: capture the real screenshot and overwrite the PNG in place
 * (same filename) with no MDX edits.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const htmlPath = path.join(__dirname, "assets", "cloud-pc-placeholder.html");
const blogDir = path.join(repoRoot, "public", "assets", "blog");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const browser = CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error(
    "No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser executable.",
  );
  process.exit(1);
}

// out: path relative to public/assets/blog. badge: small pill label.
const SPECS = [
  // --- Daily checklist post ---
  {
    out: "daily-influencer-butler-checklist.png",
    badge: "Cover",
    title: "The Daily Influencer Butler Checklist",
    caption: "Ten minutes a day: morning pass, midday glance, evening wrap-up",
  },
  {
    out: "daily-checklist/01-action-queue.png",
    badge: "Morning",
    title: "Clear the Action Queue",
    caption: "The Action Queue with a few pending decision cards and their Approve, Reject, and Defer buttons",
  },
  {
    out: "daily-checklist/02-daily-deals-scheduler.png",
    badge: "Morning",
    title: "Check the Deals Scheduler",
    caption: "The Scheduler tab showing recently sent posts and the upcoming queue",
  },
  {
    out: "daily-checklist/03-daily-commission.png",
    badge: "Morning",
    title: "Review Daily Commission Butler",
    caption: "The most recent run results with the campaigns that were accepted",
  },
  {
    out: "daily-checklist/04-pricecrash.png",
    badge: "Midday",
    title: "Scan Pricecrash Butler's catches",
    caption: "The results table with recent catches from a scan",
  },
  {
    out: "daily-checklist/05-topbar-totals.png",
    badge: "Evening",
    title: "Read the topbar numbers",
    caption: "The main window topbar with the Hours Saved and Money Saved totals",
  },
  {
    out: "daily-checklist/06-tune-filters.png",
    badge: "Evening",
    title: "Make one small tune-up",
    caption: "The Deal Filters tab with minimum discount and category options",
  },
  // --- Getting started post ---
  {
    out: "how-to-get-started-with-influencer-butler.png",
    badge: "Cover",
    title: "How to Get Started With Influencer Butler",
    caption: "Your first fifteen minutes, from download to your first running butler",
  },
  {
    out: "getting-started/01-download.png",
    badge: "Step 1",
    title: "Step 1: Download the app",
    caption: "The influencerbutler.com download page with the download button",
  },
  {
    out: "getting-started/02-first-launch.png",
    badge: "Step 1",
    title: "Install and open it",
    caption: "The app open on the first screen you see after a fresh install",
  },
  {
    out: "getting-started/03-sign-in.png",
    badge: "Step 2",
    title: "Step 2: Sign in with a magic link",
    caption: "The sign-in screen with the email field and the send-link button",
  },
  {
    out: "getting-started/04-pick-goal.png",
    badge: "Step 3",
    title: "Step 3: Pick your goal",
    caption: "The setup walkthrough on the step where you pick your first goal",
  },
  {
    out: "getting-started/05-amazon-login.png",
    badge: "Step 4",
    title: "Step 4: Connect your Amazon storefront",
    caption: "The built-in browser window showing the Amazon sign-in page",
  },
  {
    out: "getting-started/06-creator-connections.png",
    badge: "Step 5",
    title: "Step 5: Connect Creator Connections",
    caption: "The API Integrations section with the Creator Connections credentials card",
  },
  {
    out: "getting-started/07-warm-up.png",
    badge: "Step 6",
    title: "Step 6: Let your butlers warm up",
    caption: "The setup walkthrough running the first butler setup in the background",
  },
  {
    out: "getting-started/08-main-screen.png",
    badge: "Step 7",
    title: "Step 7: Get to know the main screen",
    caption: "The main window with the left menu of butlers and the topbar totals",
  },
];

for (const spec of SPECS) {
  const outPath = path.join(blogDir, spec.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const params = new URLSearchParams({
    badge: encodeURIComponent(spec.badge),
    title: encodeURIComponent(spec.title),
    caption: encodeURIComponent(spec.caption),
  });
  const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/") + "?" + params.toString();
  execFileSync(browser, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1600,1000",
    `--screenshot=${outPath}`,
    fileUrl,
  ]);
  const { size } = fs.statSync(outPath);
  console.log(`wrote ${spec.out} (${Math.round(size / 1024)} KB)`);
}

console.log(`\nDone. ${SPECS.length} images written using ${path.basename(browser)}.`);
