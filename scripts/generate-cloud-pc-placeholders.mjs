/**
 * Renders scripts/assets/cloud-pc-placeholder.html once per step into branded
 * placeholder PNGs for the "Run Influencer Butler on a free cloud PC" blog post
 * and the matching Help & Tutorials entry. Uses the locally installed
 * Chrome/Edge in headless mode (same approach as generate-competitor-graphic.mjs).
 * No npm dependencies.
 *
 * Usage: node scripts/generate-cloud-pc-placeholders.mjs
 *
 * The blog post and tutorial both point at these same /assets/blog/cloud-pc/*
 * paths, so the user captures each screenshot once and overwrites the PNG in
 * place (same filename) with no MDX edits.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const htmlPath = path.join(__dirname, "assets", "cloud-pc-placeholder.html");
const blogDir = path.join(repoRoot, "public", "assets", "blog");
const stepsDir = path.join(blogDir, "cloud-pc");

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
  {
    out: "run-influencer-butler-free-cloud-pc.png",
    badge: "Cover",
    title: "Run Influencer Butler on a free cloud PC",
    caption: "A free, always-on computer in the cloud that runs your butlers 24/7",
  },
  {
    out: "cloud-pc/01-signup.png",
    badge: "Step 1",
    title: "Step 1: Create your free AWS account",
    caption: "The AWS sign-up page with the email box and Create a free account button",
  },
  {
    out: "cloud-pc/02-free-credits.png",
    badge: "Step 2",
    title: "Step 2: Find your free credits",
    caption: "The AWS Free Tier / billing page showing your free credit balance",
  },
  {
    out: "cloud-pc/03-open-ec2.png",
    badge: "Step 3",
    title: "Step 3: Open EC2",
    caption: "The AWS search bar with EC2 typed in and the EC2 result highlighted",
  },
  {
    out: "cloud-pc/04-launch-instance.png",
    badge: "Step 4",
    title: "Step 4: Launch instance",
    caption: "The EC2 dashboard with the orange Launch instance button",
  },
  {
    out: "cloud-pc/05-name-windows.png",
    badge: "Step 5",
    title: "Step 5: Pick Windows",
    caption: "The Name box filled in and a Windows image selected (marked Free tier eligible)",
  },
  {
    out: "cloud-pc/06-instance-size.png",
    badge: "Step 6",
    title: "Step 6: Choose a size",
    caption: "The instance type list with a 2 to 4 GB size such as t3.small selected",
  },
  {
    out: "cloud-pc/07-key-pair.png",
    badge: "Step 7",
    title: "Step 7: Create a key pair",
    caption: "The Create key pair pop-up (this unlocks your password later)",
  },
  {
    out: "cloud-pc/08-allow-rdp.png",
    badge: "Step 8",
    title: "Step 8: Allow Remote Desktop",
    caption: "The network settings box with Allow RDP traffic checked",
  },
  {
    out: "cloud-pc/09-launch-success.png",
    badge: "Step 9",
    title: "Step 9: Launch it",
    caption: "The green Success screen after you launch the instance",
  },
  {
    out: "cloud-pc/10-get-password.png",
    badge: "Step 10",
    title: "Step 10: Get your password",
    caption: "The Connect screen, RDP client tab, with the Get password button",
  },
  {
    out: "cloud-pc/11-remote-desktop.png",
    badge: "Step 11",
    title: "Step 11: Open Remote Desktop",
    caption: "The Remote Desktop Connection app with your cloud PC address typed in",
  },
  {
    out: "cloud-pc/12-cloud-desktop.png",
    badge: "Step 12",
    title: "Step 12: You are in",
    caption: "The fresh Windows desktop of your brand-new cloud PC",
  },
  {
    out: "cloud-pc/13-download-ib.png",
    badge: "Step 13",
    title: "Step 13: Install Influencer Butler",
    caption: "The Influencer Butler download page open in the browser on the cloud PC",
  },
  {
    out: "cloud-pc/14-running.png",
    badge: "Step 14",
    title: "Step 14: Start your butlers",
    caption: "Influencer Butler running and logged in on the cloud desktop",
  },
  {
    out: "cloud-pc/15-billing-alarm.png",
    badge: "Step 15",
    title: "Step 15: Keep it free",
    caption: "The AWS Budgets page creating a small billing alarm so there are no surprises",
  },
];

fs.mkdirSync(stepsDir, { recursive: true });

for (const spec of SPECS) {
  const outPath = path.join(blogDir, spec.out);
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

console.log(`\nDone. ${SPECS.length} placeholder images written using ${path.basename(browser)}.`);
