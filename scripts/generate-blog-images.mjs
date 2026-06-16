/**
 * Summary: Generates the hero image for every blog post from its `imagePrompt`
 *   in content/blog/_index.json, using the OpenAI Images API (gpt-image-1), and
 *   saves each as an SEO-named PNG under public/assets/blog/<slug>.png. Run this
 *   locally; it needs outbound network access and your OpenAI key.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-blog-images.mjs
 *   OPENAI_API_KEY=sk-... node scripts/generate-blog-images.mjs --force
 *   OPENAI_API_KEY=sk-... node scripts/generate-blog-images.mjs --only=what-is-benable
 *
 * On Windows PowerShell:
 *   $env:OPENAI_API_KEY="sk-..."; node scripts/generate-blog-images.mjs
 *
 * Flags:
 *   --force         Regenerate images even if the file already exists.
 *   --only=<slug>   Only generate the image for one post id.
 *   --size=WxH      Override image size (default 1536x1024). gpt-image-1
 *                   supports 1024x1024, 1024x1536, 1536x1024, auto.
 *   --model=NAME    Override the image model (default gpt-image-1).
 *   --quality=Q     Image quality: low | medium | high | auto (default medium).
 *                   Lower quality is dramatically cheaper. "high" can cost 4-10x
 *                   more than "medium" for little visible gain at blog-hero size.
 *
 * Dependencies: node:fs, node:path (Node 18+ for global fetch). No npm installs.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(repoRoot, "content", "blog", "_index.json");
const publicDir = path.join(repoRoot, "public");

// Keep a consistent on-brand look across every hero image.
const STYLE_SUFFIX =
  " Editorial flat vector illustration, clean and modern, soft rounded shapes, " +
  "warm and friendly, generous negative space, cohesive palette of warm orange " +
  "(#f59e0b) with deep navy and soft cream, subtle texture, no text, no words, " +
  "no letters, no logos, no watermark, 16:9 landscape composition.";

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;
const sizeArg = args.find((a) => a.startsWith("--size="));
const size = sizeArg ? sizeArg.split("=")[1] : "1536x1024";
const modelArg = args.find((a) => a.startsWith("--model="));
const model = modelArg ? modelArg.split("=")[1] : "gpt-image-1";
const qualityArg = args.find((a) => a.startsWith("--quality="));
const VALID_QUALITY = ["low", "medium", "high", "auto"];
let quality = qualityArg ? qualityArg.split("=")[1] : "medium";
if (!VALID_QUALITY.includes(quality)) {
  console.warn(
    `Unknown --quality "${quality}". Using "medium". Valid: ${VALID_QUALITY.join(", ")}.`
  );
  quality = "medium";
}

const API_KEY = process.env.OPENAI_API_KEY;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fileExists(p) {
  try {
    await access(p, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function generateOne(post) {
  // post.image is a public path like /assets/blog/<slug>.png
  const rel = post.image.replace(/^\//, "");
  const outPath = path.join(publicDir, rel);

  if (!force && (await fileExists(outPath))) {
    console.log(`  skip (exists): ${post.image}`);
    return "skipped";
  }

  const prompt = `${post.imagePrompt}${STYLE_SUFFIX}`;
  console.log(`  generating: ${post.image}`);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
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
  if (!b64) {
    throw new Error(`No image data returned for ${post.id}`);
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(b64, "base64"));
  console.log(`  saved: ${outPath}`);
  return "generated";
}

async function main() {
  if (!API_KEY) {
    console.error(
      "ERROR: OPENAI_API_KEY is not set.\n" +
        "Set it for this run, e.g.:\n" +
        "  OPENAI_API_KEY=sk-... node scripts/generate-blog-images.mjs\n" +
        "PowerShell:\n" +
        '  $env:OPENAI_API_KEY="sk-..."; node scripts/generate-blog-images.mjs'
    );
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let posts = Array.isArray(manifest.posts) ? manifest.posts : [];
  if (only) posts = posts.filter((p) => p.id === only);

  if (!posts.length) {
    console.error(only ? `No post with id "${only}".` : "No posts in manifest.");
    process.exit(1);
  }

  console.log(
    `Generating ${posts.length} image(s) with ${model} at ${size}, quality=${quality}` +
      (force ? " (force)" : "") +
      "\n"
  );

  let generated = 0;
  let skipped = 0;
  const failures = [];

  for (const post of posts) {
    if (!post.image || !post.imagePrompt) {
      console.log(`  skip (no image/prompt): ${post.id}`);
      continue;
    }
    try {
      const result = await generateOne(post);
      if (result === "generated") generated++;
      else skipped++;
      // Gentle pacing to stay clear of rate limits.
      if (result === "generated") await sleep(1500);
    } catch (err) {
      console.error(`  FAILED ${post.id}: ${err.message}`);
      failures.push(post.id);
    }
  }

  console.log(
    `\nDone. generated=${generated} skipped=${skipped} failed=${failures.length}`
  );
  if (failures.length) {
    console.log(`Failed posts: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
