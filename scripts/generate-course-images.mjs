/**
 * Summary: Generates a hero image for every module of the free Amazon
 *   Influencer course, using the OpenAI Images API (gpt-image-1), then
 *   downsizes with sharp so course pages stay light. Output:
 *   public/assets/course/<module-id>.png (~1200px wide). Prompts live in
 *   this file (modules are content, not manifest posts). Run locally; needs
 *   outbound network access and your OpenAI key.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-course-images.mjs
 *   OPENAI_API_KEY=sk-... node scripts/generate-course-images.mjs --only=aip-course-05-filming-review-videos
 *
 * On Windows PowerShell:
 *   $env:OPENAI_API_KEY="sk-..."; node scripts/generate-course-images.mjs
 *
 * Flags:
 *   --force         Regenerate even if the file exists.
 *   --only=<id>     Only one module.
 *   --quality=Q     low | medium | high | auto (default medium).
 *
 * Dependencies: node:fs, node:path, sharp (already a repo dependency).
 */
import { writeFile, mkdir, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "course");

// Same brand look as the blog heroes (see generate-blog-images.mjs).
const STYLE_SUFFIX =
  " Editorial flat vector illustration, clean and modern, soft rounded shapes, " +
  "warm and friendly, generous negative space, cohesive palette of warm orange " +
  "(#f59e0b) with deep navy and soft cream, subtle texture, no text, no words, " +
  "no letters, no logos, no watermark, 16:9 landscape composition.";

const PROMPTS = {
  "aip-course-01-start-here":
    "A cheerful person at the starting line of a winding path made of checkboxes, some already ticked, leading toward a bright horizon with a small trophy.",
  "aip-course-02-what-is-the-amazon-influencer-program":
    "A lightbulb hovering over a smartphone showing a product video, with coins gently flowing from the screen into a small jar.",
  "aip-course-03-requirements-and-applying":
    "A friendly application form on a clipboard with a big checkmark stamp, surrounded by social media profile cards.",
  "aip-course-04-onsite-video-approval":
    "Three small video player cards passing through an open gate with a reviewer's magnifying glass above them.",
  "aip-course-05-filming-review-videos":
    "A phone on a tiny tripod filming a household product on a table near a bright window, hands adjusting the product.",
  "aip-course-06-upload-and-optimize":
    "Video thumbnails flowing upward from a laptop into organized shelves, each with a neat price-tag-style label.",
  "aip-course-07-build-your-storefront":
    "A cozy little storefront with an awning, its shelves stocked with tidy product collections and idea-list baskets.",
  "aip-course-08-reports-and-analytics":
    "A calm person with a warm mug looking at a simple rising chart on a screen, a small weekly calendar beside it.",
  "aip-course-09-first-30-days":
    "A monthly calendar with four highlighted weekly milestones connected by a path, small flags on each milestone.",
  "aip-course-10-scaling-and-automation":
    "A friendly small robot assistant handing packages to a creator who is filming, with growth arrows in the background.",
  "aip-course-11-faq":
    "Floating speech bubbles with question marks being sorted into tidy answered stacks with checkmarks.",
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;
const qualityArg = args.find((a) => a.startsWith("--quality="));
const VALID_QUALITY = ["low", "medium", "high", "auto"];
let quality = qualityArg ? qualityArg.split("=")[1] : "medium";
if (!VALID_QUALITY.includes(quality)) quality = "medium";

const API_KEY = process.env.OPENAI_API_KEY;
const TARGET_WIDTH = 1200;

async function fileExists(p) {
  try {
    await access(p, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function generateOne(sharp, id, promptBase) {
  const outPath = path.join(outDir, `${id}.png`);
  if (!force && (await fileExists(outPath))) {
    console.log(`  skip (exists): ${id}`);
    return "skipped";
  }
  console.log(`  generating: ${id}`);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: `${promptBase}${STYLE_SUFFIX}`,
      size: "1536x1024",
      quality,
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image data returned for ${id}`);

  await mkdir(outDir, { recursive: true });
  const resized = await sharp(Buffer.from(b64, "base64"))
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(outPath, resized);
  console.log(`  saved: assets/course/${id}.png (${Math.round(resized.length / 1024)} KB)`);
  return "generated";
}

async function main() {
  if (!API_KEY) {
    console.error(
      "ERROR: OPENAI_API_KEY is not set.\n" +
        'PowerShell:  $env:OPENAI_API_KEY="sk-..."; node scripts/generate-course-images.mjs'
    );
    process.exit(1);
  }
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("ERROR: 'sharp' is not installed. Run:  npm install sharp");
    process.exit(1);
  }

  let entries = Object.entries(PROMPTS);
  if (only) entries = entries.filter(([id]) => id === only);
  if (!entries.length) {
    console.error(only ? `No module with id "${only}".` : "No prompts defined.");
    process.exit(1);
  }

  console.log(`Generating ${entries.length} course image(s), quality=${quality}${force ? " (force)" : ""}\n`);
  let generated = 0;
  let skipped = 0;
  const failures = [];
  for (const [id, promptBase] of entries) {
    try {
      const result = await generateOne(sharp, id, promptBase);
      if (result === "generated") generated += 1;
      else skipped += 1;
    } catch (err) {
      failures.push(id);
      console.error(`  FAILED ${id}: ${err?.message || err}`);
    }
  }
  console.log(`\nDone. generated=${generated} skipped=${skipped} failed=${failures.length}`);
  if (failures.length) process.exit(1);
}

main();
