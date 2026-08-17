// Launches a headed Chrome with the unpacked extension loaded and a CDP port,
// then stays alive so capture-shot.mjs can connect repeatedly.
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const REPO = "C:/Users/eliza/OneDrive/Documents/GitHub/influencerbutler.com";
const DIST = path.join(REPO, "extension", "dist");
const PROFILE = path.join(process.env.TEMP || ".", "ib-store-shots-profile");
fs.mkdirSync(PROFILE, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  channel: process.env.IB_BROWSER_CHANNEL || "msedge",
  headless: false,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    "--remote-debugging-port=9333",
    "--hide-scrollbars",
    "--window-size=1300,900",
  ],
  ignoreDefaultArgs: ["--enable-automation"],
});

// Resolve the unpacked extension id from its MV3 service worker.
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
const extId = sw ? new URL(sw.url()).host : "UNKNOWN";
fs.writeFileSync(path.join(process.env.TEMP || ".", "ib-store-shots-extid.txt"), extId);
console.log("READY extension id:", extId);

// Keep alive until killed.
await new Promise(() => {});
