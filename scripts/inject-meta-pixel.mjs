// Idempotent codemod: sync the Meta (Facebook) Pixel snippet into every
// public/**/*.html. Run via `npm run inject:meta-pixel` or as a `prebuild`
// hook. Mirrors inject-gtag.mjs, with one difference: the pixel id comes from
// NEXT_PUBLIC_META_PIXEL_ID (set in Vercel, see docs/meta-ads-tracking.md)
// instead of being hardcoded, so this script SYNCS rather than injects:
//   - env var set: insert the snippet, or update it if the id changed
//   - env var unset: remove any previously injected snippet
// That keeps the committed HTML pixel-free until the Meta account exists and
// means production picks the pixel up purely from the Vercel env at build
// time. App-router pages get the same pixel from src/components/MetaPixel.tsx.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const START = "<!-- meta-pixel:start -->";
const END = "<!-- meta-pixel:end -->";

function pixelBlock(id) {
  // Consent-gated: the pixel stays dormant until the visitor grants advertising
  // consent via the cookie banner (public/js/consent.js), which sets the
  // ib_ads_consent cookie and dispatches "ib-consent-change". No <noscript>
  // fallback: a no-JS visitor cannot reach the consent banner. The app-router
  // twin is src/components/MetaPixel.tsx.
  return `${START}
  <script>
    (function(){
      var started=false;
      function start(){
        if(started)return;started=true;
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${id}');fbq('track','PageView');
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
    console.log("inject-meta-pixel: NEXT_PUBLIC_META_PIXEL_ID unset, ensuring snippets are absent");
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
  console.log(`inject-meta-pixel: scanned ${scanned} files, modified ${modified}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
