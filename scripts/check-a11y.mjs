// Automated accessibility check (axe-core via Playwright Chromium).
//
// Visits the key public pages and fails (exit 1) on any serious or critical
// axe violation, so accessibility regressions are caught before deploy. Run
// against a dev server:
//
//   npm run dev            (in one terminal)
//   npm run test:a11y      (in another; or A11Y_BASE_URL=https://... to point elsewhere)
//
// Scope note: /help/tutorials/* pages are login-gated; the public
// /help/tutorials/extension page stands in for the tutorial template.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const BASE = (process.env.A11Y_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const PAGES = [
  "/",
  "/pricing",
  "/signup",
  "/contact",
  "/affiliates/apply",
  "/legal/accessibility",
  "/help/tutorials/extension",
  // Build Week is dark (404) until launch, so only check it when the flag is on.
  ...(process.env.NEXT_PUBLIC_BUILD_WEEK_ENABLED === "1"
    ? ["/build-week", "/build-week?lang=es-ES", "/legal/build-week-rules"]
    : []),
];

// Impact levels that fail the check.
const FAILING_IMPACTS = new Set(["serious", "critical"]);

async function main() {
  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failures = 0;

  for (const path of PAGES) {
    const url = BASE + path;
    try {
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      if (!res || res.status() >= 400) {
        console.error(`FAIL ${path}: HTTP ${res ? res.status() : "no response"}`);
        failures += 1;
        continue;
      }
      await page.evaluate(axeSource);
      const results = await page.evaluate(() =>
        // Best-practice rules are advisory; WCAG A/AA tags are the legal bar.
        window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        }),
      );
      const bad = results.violations.filter((v) => FAILING_IMPACTS.has(v.impact));
      const minor = results.violations.length - bad.length;
      if (bad.length) {
        failures += 1;
        console.error(`FAIL ${path}: ${bad.length} serious/critical violation(s)`);
        for (const v of bad) {
          console.error(`  [${v.impact}] ${v.id}: ${v.help}`);
          for (const node of v.nodes.slice(0, 3)) {
            console.error(`    ${node.target.join(" ")}`);
          }
        }
      } else {
        console.log(`ok   ${path}${minor ? ` (${minor} minor/moderate note(s))` : ""}`);
      }
    } catch (err) {
      failures += 1;
      console.error(`FAIL ${path}: ${err.message}`);
    }
  }

  await browser.close();
  if (failures) {
    console.error(`\n${failures} page(s) failed the accessibility check.`);
    process.exit(1);
  }
  console.log("\nAll pages passed the serious/critical accessibility bar.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
