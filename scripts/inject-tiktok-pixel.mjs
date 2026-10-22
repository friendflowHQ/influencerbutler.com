// Idempotent codemod: sync the TikTok Pixel snippet into every
// public/**/*.html. Run via `npm run inject:tiktok-pixel` or as a `prebuild`
// hook. Mirrors inject-meta-pixel.mjs exactly: the pixel id comes from
// NEXT_PUBLIC_TIKTOK_PIXEL_ID (set in Vercel, see docs/tiktok-tracking.md), so
// this script SYNCS rather than injects:
//   - env var set: insert the snippet, or update it if the id changed
//   - env var unset: remove any previously injected snippet
// That keeps the committed HTML pixel-free until the TikTok account exists and
// means production picks the pixel up purely from the Vercel env at build
// time. App-router pages get the same pixel from src/components/TikTokPixel.tsx.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

const PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "";
const START = "<!-- tiktok-pixel:start -->";
const END = "<!-- tiktok-pixel:end -->";

function pixelBlock(id) {
  // Consent-gated: the pixel stays dormant until the visitor grants advertising
  // consent via the cookie banner (public/js/consent.js), which sets the
  // ib_ads_consent cookie and dispatches "ib-consent-change". No <noscript>
  // fallback: a no-JS visitor cannot reach the consent banner. The app-router
  // twin is src/components/TikTokPixel.tsx.
  return `${START}
  <script>
    (function(){
      var started=false;
      function start(){
        if(started)return;started=true;
        !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
        ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
        ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
        for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
        ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
        ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
        ttq.load('${id}');ttq.page();
      }
      function consented(){
        try{
          if(window.ibConsent&&window.ibConsent.get){
            var c=window.ibConsent.get();
            if(c&&typeof c.analytics==='boolean')return c.analytics;
          }
          return document.cookie.split('; ').indexOf('ib_ads_consent=1')!==-1;
        }catch(e){return false;}
      }
      if(consented())start();
      window.addEventListener('ib-consent-change',function(e){
        if(e&&e.detail&&e.detail.analytics)start();
      });
    })();
  </script>
  ${END}`;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      yield full;
    }
  }
}

async function syncFile(file) {
  const html = await readFile(file, "utf8");
  const startIdx = html.indexOf(START);
  const endIdx = html.indexOf(END);
  const hasBlock = startIdx !== -1 && endIdx !== -1;

  if (!PIXEL_ID) {
    if (!hasBlock) return null;
    // Var unset but a block exists (e.g. from a local run with .env vars
    // loaded): strip it so the committed HTML stays pixel-free.
    const before = html.slice(0, startIdx).replace(/[ \t]*$/, "");
    const after = html.slice(endIdx + END.length).replace(/^\n/, "");
    await writeFile(file, before + after);
    return "removed";
  }

  const block = pixelBlock(PIXEL_ID);
  if (hasBlock) {
    const current = html.slice(startIdx, endIdx + END.length);
    if (current === block) return null;
    await writeFile(file, html.slice(0, startIdx) + block + html.slice(endIdx + END.length));
    return "updated";
  }

  let updated;
  if (/<\/head>/i.test(html)) {
    updated = html.replace(/<\/head>/i, `  ${block}\n</head>`);
  } else if (/<body[^>]*>/i.test(html)) {
    updated = html.replace(/<body[^>]*>/i, (match) => `${block}\n${match}`);
  } else {
    updated = `${block}\n${html}`;
  }
  await writeFile(file, updated);
  return "injected";
}

async function main() {
  if (!PIXEL_ID) {
    console.log("inject-tiktok-pixel: NEXT_PUBLIC_TIKTOK_PIXEL_ID unset, ensuring snippets are absent");
  }
  let scanned = 0;
  let modified = 0;
  for await (const file of walk(publicDir)) {
    scanned++;
    const action = await syncFile(file);
    if (action) {
      modified++;
      console.log(`  + ${action}: ${path.relative(repoRoot, file)}`);
    }
  }
  console.log(`inject-tiktok-pixel: scanned ${scanned} files, modified ${modified}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
