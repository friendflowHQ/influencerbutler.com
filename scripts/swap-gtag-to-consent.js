#!/usr/bin/env node
/**
 * One-off: replace the inline gtag.js boot block in every public/*.html
 * page with a single <script src="/js/consent.js" defer></script>.
 * The consent module handles Consent Mode v2 defaults and loads gtag.js
 * after the banner choice (or stored preference) is resolved.
 *
 * Safe to re-run: idempotent. Files already converted are skipped.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "public");
const REPLACEMENT = '<script src="/js/consent.js" defer></script>';

// Matches:
//   [optional indent]<!-- Google tag (gtag.js) -->
//   <script async src="https://www.googletagmanager.com/gtag/js?id=G-S1TC1QLYNN"></script>
//   <script> ... gtag('config', 'G-S1TC1QLYNN'); </script>
// Two scripts back-to-back with arbitrary whitespace + newlines between.
const PATTERN = /([ \t]*)<!--\s*Google tag \(gtag\.js\)\s*-->\s*\n\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-S1TC1QLYNN"><\/script>\s*\n\s*<script>[\s\S]*?gtag\('config',\s*'G-S1TC1QLYNN'\);\s*<\/script>/g;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.html$/i.test(entry.name)) out.push(full);
  }
  return out;
}

let touched = 0;
let skipped = 0;
let untouchable = [];
for (const file of walk(ROOT, [])) {
  const src = fs.readFileSync(file, "utf8");
  if (!PATTERN.test(src)) {
    // Either already converted, or the inline block doesn't match.
    if (src.includes("/js/consent.js")) skipped += 1;
    else if (src.includes("G-S1TC1QLYNN")) untouchable.push(file);
    continue;
  }
  PATTERN.lastIndex = 0;
  const replaced = src.replace(PATTERN, (_m, indent) => `${indent}${REPLACEMENT}`);
  if (replaced === src) continue;
  fs.writeFileSync(file, replaced, "utf8");
  touched += 1;
  console.log("rewrote", path.relative(ROOT, file));
}

console.log(`\nDone. rewrote=${touched} already-converted=${skipped} ` +
  `unmatched-with-ga-id=${untouchable.length}`);
if (untouchable.length) {
  console.log("\nFiles that still reference the GA ID but did not match the " +
    "inline-block pattern — these need a manual look:");
  for (const f of untouchable) console.log("  - " + path.relative(ROOT, f));
}
