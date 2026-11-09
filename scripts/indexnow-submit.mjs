// Pings IndexNow (Bing, Yandex, Seznam, Naver) with every URL in
// public/sitemap.xml so new and changed pages are re-crawled within hours
// instead of weeks. Bing's index is what ChatGPT search and Copilot answer
// from, so this is the fastest way to get fresh pages into AI answers.
//
// Run after a deploy (the key file must already be live on www):
//   npm run indexnow            -> submit every sitemap URL
//   npm run indexnow -- --dry   -> print what would be sent
//   npm run indexnow -- /blog/some-post /features/x   -> submit just these paths
//
// The key lives in public/<key>.txt (IndexNow verifies ownership by fetching it).
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const HOST = "www.influencerbutler.com";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 10000; // protocol max per request

async function findKey() {
  for (const name of await readdir(publicDir)) {
    const m = name.match(/^([a-f0-9]{32})\.txt$/);
    if (!m) continue;
    const body = (await readFile(path.join(publicDir, name), "utf8")).trim();
    if (body === m[1]) return m[1];
  }
  throw new Error("No IndexNow key file found in public/ (expected <32-hex>.txt containing the key)");
}

async function sitemapUrls() {
  const xml = await readFile(path.join(publicDir, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const paths = args.filter((a) => !a.startsWith("--"));
  const key = await findKey();
  const urls = paths.length
    ? paths.map((p) => (p.startsWith("http") ? p : `${ORIGIN}${p.startsWith("/") ? "" : "/"}${p}`))
    : await sitemapUrls();

  const live = await fetch(`${ORIGIN}/${key}.txt`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  if (live.trim() !== key) {
    console.error(`indexnow: ${ORIGIN}/${key}.txt is not live yet. Deploy first, then rerun.`);
    if (!dry) process.exit(1);
  }

  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH);
    const body = { host: HOST, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList };
    if (dry) {
      console.log(`indexnow (dry): would submit ${urlList.length} URLs, first: ${urlList[0]}`);
      continue;
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    // 200 = accepted, 202 = accepted pending key verification.
    console.log(`indexnow: submitted ${urlList.length} URLs -> HTTP ${res.status}`);
    if (res.status >= 400) {
      console.error(await res.text().catch(() => ""));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
