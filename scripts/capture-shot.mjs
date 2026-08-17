// Connects to the held Chrome (capture-hold.mjs) over CDP and runs one action.
// Usage:
//   node capture-shot.mjs goto <url> [waitMs]
//   node capture-shot.mjs shot <outPath> [waitMs]         (viewport screenshot of active page)
//   node capture-shot.mjs gotoshot <url> <outPath> [waitMs]
//   node capture-shot.mjs eval "<js expression>"
//   node capture-shot.mjs scroll <px>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [, , cmd, ...rest] = process.argv;
const browser = await chromium.connectOverCDP("http://localhost:9333");
const context = browser.contexts()[0];

function activePage() {
  const pages = context.pages();
  if (!pages.length) throw new Error("no pages");
  return pages[pages.length - 1];
}

async function shot(page, out, waitMs) {
  if (waitMs) await page.waitForTimeout(waitMs);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: "png" });
  const { width, height } = page.viewportSize() || {};
  console.log("SAVED", out, `viewport ${width}x${height}`);
}

if (cmd === "goto") {
  const [url, waitMs] = rest;
  const page = activePage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (waitMs) await page.waitForTimeout(Number(waitMs));
  console.log("AT", page.url(), "title:", await page.title());
} else if (cmd === "shot") {
  const [out, waitMs] = rest;
  await shot(activePage(), out, Number(waitMs || 0));
} else if (cmd === "gotoshot") {
  const [url, out, waitMs] = rest;
  const page = activePage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await shot(page, out, Number(waitMs || 6000));
} else if (cmd === "eval") {
  const [expr] = rest;
  const result = await activePage().evaluate(expr);
  console.log(JSON.stringify(result));
} else if (cmd === "wheel") {
  const [x, y, dy] = rest.map(Number);
  const page = activePage();
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, dy);
  console.log("wheeled", dy, "at", x, y);
} else if (cmd === "scroll") {
  const [px] = rest;
  await activePage().evaluate((y) => window.scrollBy(0, y), Number(px));
  console.log("scrolled", px);
} else {
  console.log("unknown cmd", cmd);
}
await browser.close(); // detaches CDP only; held browser keeps running
