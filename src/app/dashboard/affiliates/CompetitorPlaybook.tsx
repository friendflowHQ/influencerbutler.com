"use client";

// Affiliate Competitor Playbook: accurate comparisons affiliates can use to
// promote Influencer Butler against Oink, Viral Vue, Cha-Ching Automate, Logie,
// JoyLink, ManyChat, and the single-purpose deeplink tools (Genius Link,
// URLGenius, Linktw.in).
// KEEP CURRENT: update the table/copy when we ship new butlers, and refresh
// competitor rows weekly. See the app repo's "Keep the affiliate
// competitor-analysis materials current" note and the weekly scheduled task.
// Last reviewed: 2026-09-04

import Image from "next/image";
import { useState } from "react";

// Every competitor claim in this file is "as of" this date. Update it every
// time the rows/copy are re-verified against the competitors' live sites.
const LAST_REVIEWED = "September 4, 2026";

type Verdict = "yes" | "ltd" | "no" | "text";

type Cellv = { v: Verdict; t?: string };

type Row = {
  cap: string;
  ib: Cellv;
  oink: Cellv;
  vue: Cellv;
  cha: Cellv;
  logie: Cellv;
  joy: Cellv;
  many: Cellv;
  deep: Cellv;
};

const ROWS: Row[] = [
  {
    cap: "Product type",
    ib: { v: "text", t: "Desktop app (Win/Mac)" },
    oink: { v: "text", t: "Chrome extension" },
    vue: { v: "text", t: "Extension + web app" },
    cha: { v: "text", t: "Desktop app" },
    logie: { v: "text", t: "Extension + web portal" },
    joy: { v: "text", t: "Extension + web app" },
    many: { v: "text", t: "Web app (chat)" },
    deep: { v: "text", t: "Link tools (web)" },
  },
  {
    cap: "Entry price",
    ib: { v: "text", t: "Free + $39/mo (trial)" },
    oink: { v: "text", t: "$29.99/mo (free tier)" },
    vue: { v: "text", t: "Free / $33+/mo" },
    cha: { v: "text", t: "$20/mo" },
    logie: { v: "text", t: "$0 free / $49.75+/mo" },
    joy: { v: "text", t: "$20/mo + usage (free)" },
    many: { v: "text", t: "Free / $17+/mo" },
    deep: { v: "text", t: "Free / ~$14/mo" },
  },
  {
    cap: "Number of tools",
    ib: { v: "text", t: "40+ connected" },
    oink: { v: "text", t: "40+" },
    vue: { v: "text", t: "Several" },
    cha: { v: "text", t: "1 (video sync)" },
    logie: { v: "text", t: "AI suite (credit-metered)" },
    joy: { v: "text", t: "Deep-link suite" },
    many: { v: "text", t: "Chat automation" },
    deep: { v: "text", t: "Link routing" },
  },
  {
    cap: "Free browser extension (video counts, gaps, seal, storefront)",
    ib: { v: "yes", t: "free, Amazon + Walmart" },
    oink: { v: "ltd", t: "free tier" },
    vue: { v: "ltd", t: "free tier" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "free tier, score cap 60" },
    joy: { v: "ltd", t: "deep-link ext" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Auto-accept Creator Connections",
    ib: { v: "yes", t: "CC + SPCC" },
    oink: { v: "yes", t: "CC (Pro)" },
    vue: { v: "yes", t: "CC (Pro)" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "CC visibility + reminders" },
    joy: { v: "ltd", t: "auto-apply (add-on)" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Automated brand outreach + follow-ups",
    ib: { v: "yes" },
    oink: { v: "yes" },
    vue: { v: "yes", t: "AI" },
    cha: { v: "no" },
    logie: { v: "yes", t: "AI" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "End-to-end deal lifecycle (outreach to board to inbox to calendar to paid)",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "tracker" },
    vue: { v: "ltd", t: "tracker" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "inbox CRM" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Unified, tagged Amazon inbox",
    ib: { v: "yes" },
    oink: { v: "ltd" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "yes", t: "Inbox CRM" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Content calendar / coverage matrix",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "scheduler" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "content dashboard" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Revive dead product links in old content",
    ib: { v: "yes", t: "up to 500/run" },
    oink: { v: "ltd" },
    vue: { v: "yes" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "detects broken ASINs" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Re-upload deleted videos",
    ib: { v: "yes", t: "US/CA/UK/AU/SG" },
    oink: { v: "ltd" },
    vue: { v: "ltd" },
    cha: { v: "yes", t: "YouTube + 13 intl" },
    logie: { v: "no" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Re-post photos to international storefronts",
    ib: { v: "yes", t: "CA/UK/AU/SG" },
    oink: { v: "ltd", t: "CA/UK" },
    vue: { v: "no" },
    cha: { v: "no", t: "video only" },
    logie: { v: "ltd", t: "Amazon CA/UK publish" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Multi-platform deal auto-posting (IG, Threads, FB, Telegram, Reddit)",
    ib: { v: "yes" },
    oink: { v: "ltd" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "YouTube/Pinterest" },
    joy: { v: "ltd", t: "Telegram + IG" },
    many: { v: "ltd", t: "IG/FB/WhatsApp DMs" },
    deep: { v: "no" },
  },
  {
    cap: "AI product photo / thumbnail generation",
    ib: { v: "no" },
    oink: { v: "no" },
    vue: { v: "ltd", t: "thumbnail builder" },
    cha: { v: "no" },
    logie: { v: "yes", t: "shoppable photos + thumbnails" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Product research database",
    ib: { v: "ltd", t: "Goldmine/Ads" },
    oink: { v: "ltd" },
    vue: { v: "yes", t: "30M+ products" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "X-Ray search" },
    joy: { v: "ltd", t: "600k deal catalog" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Lifetime earnings per product",
    ib: { v: "yes" },
    oink: { v: "yes" },
    vue: { v: "yes" },
    cha: { v: "no" },
    logie: { v: "ltd" },
    joy: { v: "ltd", t: "per-link" },
    many: { v: "no" },
    deep: { v: "ltd", t: "click analytics" },
  },
  {
    cap: "Instagram DMs / Close Friends / auto-like",
    ib: { v: "yes" },
    oink: { v: "no" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "no" },
    joy: { v: "ltd", t: "IG comment-to-DM" },
    many: { v: "ltd", t: "DM flows" },
    deep: { v: "no" },
  },
  {
    cap: "Works beyond Amazon (Walmart and more)",
    ib: { v: "yes", t: "Amazon + Walmart" },
    oink: { v: "no" },
    vue: { v: "ltd", t: "TikTok (beta)" },
    cha: { v: "no" },
    logie: { v: "no" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "yes", t: "100+ apps" },
  },
  {
    cap: "Deep affiliate links (branded, app-open, click dashboard)",
    ib: { v: "yes", t: "branded + dashboard" },
    oink: { v: "ltd" },
    vue: { v: "yes", t: "URL Vue" },
    cha: { v: "ltd", t: "in descriptions" },
    logie: { v: "yes", t: "smart deep links" },
    joy: { v: "yes", t: "core feature" },
    many: { v: "no" },
    deep: { v: "yes", t: "core feature" },
  },
  {
    cap: "Monthly earnings breakdown by source + CSV/Excel",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "tracker" },
    vue: { v: "ltd", t: "dashboard" },
    cha: { v: "no" },
    logie: { v: "ltd" },
    joy: { v: "ltd", t: "per-link" },
    many: { v: "no" },
    deep: { v: "ltd" },
  },
  {
    cap: "AI voiceover with FTC disclosures baked in",
    ib: { v: "yes" },
    oink: { v: "no" },
    vue: { v: "no" },
    cha: { v: "ltd", t: "AI dubbing" },
    logie: { v: "no" },
    joy: { v: "no" },
    many: { v: "no" },
    deep: { v: "no" },
  },
  {
    cap: "Team / multi-device plans (up to 25 seats)",
    ib: { v: "yes", t: "Trio/Team/Agency" },
    oink: { v: "no" },
    vue: { v: "ltd", t: "VA mode" },
    cha: { v: "no" },
    logie: { v: "no" },
    joy: { v: "ltd", t: "team members" },
    many: { v: "ltd", t: "by plan" },
    deep: { v: "no" },
  },
  {
    cap: "Seasonal opportunity butlers (Prime Day, Black Friday, price-error radar)",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "Agent scans" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "no" },
    joy: { v: "ltd", t: "deal catalog" },
    many: { v: "no" },
    deep: { v: "no" },
  },
];

function Cell({ v, t }: { v: Verdict; t?: string }) {
  if (v === "text") {
    return <span className="text-slate-700">{t}</span>;
  }
  const mark = v === "yes" ? "✓" : v === "ltd" ? "~" : "✗";
  const color = v === "yes" ? "text-green-600" : v === "ltd" ? "text-amber-600" : "text-slate-400";
  return (
    <span className={`font-bold ${color}`}>
      {mark}
      {t ? <span className="ml-1 text-xs font-normal text-slate-500">{t}</span> : null}
    </span>
  );
}

const MASCOTS: { emoji: string; name: string; body: string; butler?: boolean }[] = [
  {
    emoji: "\u{1F933}",
    name: "Influencer Butler",
    body: "The full-time butler. Does the whole job start to finish, quietly, in the background, and hands you the commissions.",
    butler: true,
  },
  {
    emoji: "\u{1F437}",
    name: "Oink",
    body: "The messy pig pen. A drawer of handy tools, but you muck it out yourself, one click at a time.",
  },
  {
    emoji: "\u{1F440}",
    name: "Viral Vue",
    body: "The researcher. Great product intel, then it hands you a clipboard and says “good luck posting it.”",
  },
  {
    emoji: "\u{1F3B0}",
    name: "Cha-Ching Automate",
    body: "The one-trick specialist. Does one job (cross-posting your videos to YouTube and 13+ international Amazon marketplaces) and nothing else.",
  },
  {
    emoji: "\u{1F3A8}",
    name: "Logie",
    body: "The AI photo studio. Dazzling shoppable images and thumbnails, but every action is metered by credits and your score is capped by tier, and you still run the storefront and the deals yourself.",
  },
  {
    emoji: "\u{1F517}",
    name: "JoyLink",
    body: "The link concierge. Turns any product into a smart app-open deep link and can auto-post your deals, but the storefront, the videos, and the brand deals are still yours to run, and it bills you by the click.",
  },
  {
    emoji: "\u{1F4AC}",
    name: "ManyChat",
    body: "The chatbot receptionist. Great at auto-replying to DMs and comments across your socials, but it knows nothing about Amazon, and the bill grows every time a post goes viral.",
  },
  {
    emoji: "\u{1F9ED}",
    name: "Deeplink tools",
    body: "The link plumber. Routes a shopper to the right app and country and appends your tag. Useful plumbing, but plumbing is all it does. Butler includes branded deep links and does the other forty jobs too.",
  },
];

type Competitor = {
  name: string;
  tag: string;
  pitch: string;
  credit: string;
  win: string;
  points: string[];
  oneliner: string;
};

const COMPETITORS: Competitor[] = [
  {
    name: "Oink",
    tag: "Chrome extension · ~$29.99/mo",
    pitch:
      "40+ in-browser Amazon tools (cross-checks, earnings tracker, collaboration tracker, brand messaging, auto-scan, storefront health check), plus an 'Agent Oink' AI assistant that scans Creator Connections while you sleep. Free tier and a mature tool set.",
    credit:
      "Oink is a genuinely capable extension with a free tier and a lower entry price. If someone only lives inside Amazon in their browser, it does a lot, and Agent Oink now auto-accepts Creator Connections on the Pro plan.",
    win:
      "As of our last check, Oink is a drawer of separate tools you operate one at a time, in one browser tab. Influencer Butler is a connected desktop system: outreach becomes a tracked collab card automatically, the inbox tags when a product ships and what to film next, and deals auto-post across five social platforms. It also accepts SPCC as well as CC, and reaches past Amazon into Instagram, YouTube, Pinterest, and Walmart.",
    points: [
      "An extension speeds up your clicking. A butler does the clicking for you.",
      "Oink hands you tools. Butler connects them so a brand deal tracks itself from shipped to filmed to paid.",
      "Butler does not stop at the edge of Amazon: it posts your deals to Instagram, Threads, Facebook, Telegram, and Reddit too.",
    ],
    oneliner: "\u{1F437} Oink is a pig pen you clean yourself. \u{1F933} Butler is the staff that cleans up for you.",
  },
  {
    name: "Viral Vue",
    tag: "Extension + web app · free / $33 / $79 mo",
    pitch:
      "Data-first product research on 30M+ products, plus Creator Connection auto-accept, AI brand-deal outreach, storefront optimizer, profits dashboard, a thumbnail builder, deep links, YouTube and Pinterest cross-posting, and revive-dead-product tools. “Stop guessing what converts.”",
    credit:
      "Viral Vue's product-research database is a real strength, and it has grown: it now ships deep links, a thumbnail builder, and Pinterest plus YouTube cross-posting. For pure discovery of what to add to your storefront, its data depth is a legitimate selling point.",
    win:
      "As of our last check, Viral Vue tells you what to promote and cross-posts your videos, then leaves the rest of the doing to you. Influencer Butler runs the whole workflow: it accepts CC and SPCC, tracks each brand deal end to end, keeps a unified Amazon inbox, reloads videos AND photos to international storefronts, and auto-posts your deals across five social platforms. Research is one step; Butler automates the other twenty.",
    points: [
      "Viral Vue is a research assistant. Butler is the whole staff that acts on the research.",
      "Great, you found a winning product. Butler is what tracks the deal, films the coverage list, and posts it everywhere while you sleep.",
      "Butler handles photos and videos, your Amazon inbox, Instagram, and deal posting, not just product picks and thumbnails.",
    ],
    oneliner: "\u{1F440} Viral Vue hands you a clipboard. \u{1F933} Butler does the shift.",
  },
  {
    name: "Cha-Ching Automate",
    tag: "Desktop app · $20/mo",
    pitch:
      "One job, done well: syncs your Amazon Influencer videos to YouTube and cross-posts them to 13+ international Amazon storefronts, auto-transcribing, translating, and captioning per country. Optional AI voiceover dubbing, auto affiliate links, thumbnail sync, playlists, scheduling.",
    credit:
      "For video specifically, Cha-Ching reaches more countries (13+), auto-translates and captions in the local language, and now offers optional AI voiceover dubbing, which Butler's Video Reload does not do today. If a creator's only goal is multilingual video-to-YouTube at scale, Cha-Ching is strong at that one thing.",
    win:
      "As of our last check, Cha-Ching focuses on video only: no photo reload, brand outreach, CC/SPCC auto-accept, collab tracking, deal posting, or inbox. Influencer Butler is a full suite: Video Reload AND Photo Reload butlers, plus 40+ other connected tools. You would need Cha-Ching plus five other tools to match one Butler.",
    points: [
      "Cha-Ching does one thing. Butler does that plus your photos, your brand deals, your posting, and your earnings tracking.",
      "It reloads videos but not photos. Butler reloads both, and revives your dead product links on top.",
      "Why rent a one-trick tool when the butler already includes it?",
    ],
    oneliner: "\u{1F3B0} Cha-Ching is one specialist. \u{1F933} Butler is the whole household staff.",
  },
  {
    name: "Logie",
    tag: "Extension + web portal · $0 free, up to $166/mo (credits)",
    pitch:
      "AI-first Amazon suite (now branded logie5): X-Ray Super Search, an Opportunity Score + Sales Rank, Creator Connections visibility and reminders, a brand Inbox CRM, sample requests, AI shoppable photos/collages/thumbnails, AI Pinterest posts, auto-publish to YouTube/Pinterest/Amazon CA-UK, smart deep links, and weekly Zoom training. Everything is credit-metered with a per-tier score cap, and the AI creation tools unlock only on Gold and Platinum.",
    credit:
      "Logie's AI image generation (shoppable photos, collages, thumbnails) is a real, unique strength that Butler does not have today. Its brand Inbox CRM and weekly live training are legit too.",
    win:
      "As of our last check, Logie meters nearly every action by credits and caps your Opportunity Score by tier (the free browser intel tops out at 60/100, and AI creation needs Gold at $83/mo or up). Influencer Butler runs the whole deal lifecycle end to end, auto-posts your deals across five social platforms, reaches past Amazon into Instagram and Walmart, and its browser extension is free with no credits and no score cap.",
    points: [
      "Logie charges you credits and caps your score by plan. Butler's free extension is uncapped, no credits, no meter.",
      "Logie auto-posts to YouTube and Pinterest. Butler posts your deals to Instagram, Threads, Facebook, Telegram, and Reddit too.",
      "Butler also revives your dead product links and reloads both your videos AND your photos to international storefronts.",
    ],
    oneliner: "\u{1F3A8} Logie paints you a pretty photo. \u{1F933} Butler runs the whole business.",
  },
  {
    name: "JoyLink",
    tag: "Extension + web app · $20/mo + usage, free plan",
    pitch:
      "One-click app-opening deep links for Amazon, a catalog of 600k+ deals, AI-written social posts, a Link in Bio, per-link analytics, and Instagram comment-to-DM automation. 'The Amazon affiliate tool that works for you.'",
    credit:
      "JoyLink's deep links are genuinely good: app-open links convert better than browser links, and its per-link analytics and deal catalog are handy. For a creator whose whole game is dropping affiliate links, it does that one thing well.",
    win:
      "As of our last check, JoyLink is a link-and-deal tool: it does not accept Creator Connections or SPCC for you, track a brand deal from shipped to filmed to paid, reload your deleted videos or photos, or unify your Amazon inbox. Influencer Butler runs that whole lifecycle, and its own branded deep links plus a Link Performance dashboard cover the linking too, so you are not renting a second tool for it. JoyLink also bills usage by the click, while Butler's extension is free with no per-click meter.",
    points: [
      "JoyLink links the sale. Butler lands the deal, films the coverage list, posts it everywhere, then links the sale too.",
      "App-open deep links are one feature. Butler ships branded deep links and a click dashboard as part of a 40+ tool suite.",
      "Per-click billing punishes your best months. Butler's free extension has no click meter.",
    ],
    oneliner: "\u{1F517} JoyLink hands the shopper a link. \u{1F933} Butler runs the whole shop.",
  },
  {
    name: "ManyChat",
    tag: "Web app (chat) · free to $39+/mo, billed by contacts",
    pitch:
      "Chat marketing across Instagram, Facebook, WhatsApp, TikTok, and Telegram: comment-to-DM triggers, keyword flows, chatbots, and broadcasts. The best-known DM automation platform.",
    credit:
      "ManyChat is excellent at what it does. Comment-to-DM funnels and chatbot flows are its home turf, and plenty of creators use it to turn a viral post into DMs. For pure social DM automation, it is a category leader.",
    win:
      "As of our last check, ManyChat knows nothing about Amazon: no Creator Connections or SPCC, no storefront, no video or photo reload, no commission tracking, no deal lifecycle. It is a generic chatbot, and its bill scales with your audience (you pay per active contact, and a viral post can trigger overage fees mid-cycle). Influencer Butler is Amazon-native end to end, and its Instagram Butler, Close Friends Butler, and auto-like butlers cover the social side at a flat price.",
    points: [
      "ManyChat automates a reply. Butler automates the business behind the reply: the campaign, the deal, the commission.",
      "A viral post makes ManyChat cost more. Butler's price does not spike with your audience.",
      "Butler speaks Amazon: campaigns, storefront, and deals. ManyChat does not.",
    ],
    oneliner: "\u{1F4AC} ManyChat answers the DM. \u{1F933} Butler runs the store the DM is about.",
  },
  {
    name: "Deeplink tools (Genius Link, URLGenius, Linktw.in)",
    tag: "Link tools · free to ~$14/mo (or per-click)",
    pitch:
      "Single-purpose link routers: turn an Amazon link into an app-opening, geo-localized deep link that appends your affiliate tag and sends shoppers to their local store, with click analytics, retargeting pixels, and A/B tests.",
    credit:
      "These tools are good at deep linking. App-open links and auto-geolocation to 20+ Amazon storefronts genuinely lift conversion, and Butler happily integrates with Genius Link, URLGenius, and Linktw.in for exactly that reason.",
    win:
      "As of our last check, link routing is all they do: no Creator Connections or SPCC, no brand outreach, no storefront or content coverage, no video or photo reload, no inbox, no deals or research. Influencer Butler integrates these providers AND ships its own branded deep links plus a Link Performance click dashboard, then does the other forty jobs around them.",
    points: [
      "A deep link routes the click. Butler creates the content, lands the deal, and tracks the commission the click pays out.",
      "Butler already integrates Genius Link, URLGenius, and Linktw.in, or routes links itself. Either way, linking is one checkbox in a 40+ tool suite.",
      "Per-click pricing adds up at scale. Butler's branded links come with the subscription.",
    ],
    oneliner: "\u{1F9ED} Deeplink tools point the shopper. \u{1F933} Butler stocks the shelves they land on.",
  },
];

const CAPTIONS: { label: string; text: string }[] = [
  {
    label: "Short",
    text: "The paid browser extensions and research tools each do a piece of the job. Influencer Butler does the whole job: messaging brands, tracking every deal from shipped to filmed to paid, reviving old content, and auto-posting your deals to 5 platforms while you sleep. Stop renting tools. Hire the butler.",
  },
  {
    label: "Free tool",
    text: "The Amazon and Walmart intel other extensions charge $30/mo for? Influencer Butler gives it to you free. See how many influencer videos any product has, find content gaps in your own orders, spot the products worth filming, and even clean someone else's tag off a link, right in your browser. No card, installs in one click:",
  },
  {
    label: "Story / Reel",
    text: "An extension makes YOU click faster. A butler clicks for you. Influencer Butler is a desktop app that auto-accepts your Creator Connections + Sponsored Products campaigns, tracks every brand collab end to end, and posts your deals across Instagram, Threads, Facebook, Telegram, and Reddit on autopilot. Free 14-day trial.",
  },
  {
    label: "Comparison hook",
    text: "I compared the top Amazon creator tools. The paid extensions = tools you run by hand. The research tools = great data, you still do the work. The single-purpose apps (video sync, deep links, chatbots) = one job only. Influencer Butler = the whole job, done for you (and its browser extension is free). Here is the breakdown.",
  },
];

// Tracked free-extension link. Points at /extension/get (NOT the bare
// /extension short link, which redirects straight to the Web Store before any
// attribution can fire). /extension/get renders our landing page and sets the
// affiliate's first-touch cookie, so a later purchase still credits them.
// Falls back to the plain landing page if the affiliate has no branded code yet.
function extensionLink(code?: string): string {
  const base = "https://www.influencerbutler.com/extension/get";
  return code ? `${base}?code=${encodeURIComponent(code)}` : base;
}

export default function CompetitorPlaybook({ code }: { code?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const trackedExtLink = extensionLink(code);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-[#f97316]">
        Affiliate resource
      </p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        Competitor Playbook
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Everything you need to promote Influencer Butler against the other Amazon-creator tools. Keep
        it honest: accurate comparisons convert better and keep us clear of trademark trouble.
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        All competitor claims below are as of {LAST_REVIEWED}.
      </p>

      <div className="mt-4 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-slate-700">
        <p className="font-semibold">Rules of the road (read once, it protects you and us)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Always disclose your affiliate relationship (#ad or &quot;affiliate link&quot;) per FTC
            rules, every post.
          </li>
          <li>
            The copy-paste captions below name no competitors on purpose: they are safe to post
            exactly as written.
          </li>
          <li>
            Naming a competitor in your own words? Verify the claim on their current site first
            (features and pricing change often) and prefer &quot;as of [date]&quot; phrasing.
          </li>
          <li>
            Opinions and jokes are fine. Specific feature and price claims must be current and
            true.
          </li>
        </ol>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <Image
          src="/assets/affiliate-competitor-butler-vs-extensions.png"
          alt="Influencer Butler versus the browser extensions comparison graphic"
          width={1080}
          height={1350}
          className="mx-auto h-auto w-full max-w-md"
        />
      </div>

      <h3 className="mt-7 text-lg font-semibold text-slate-900">The mascot pitch</h3>
      <p className="mt-1 text-sm text-slate-600">
        A butler is a hard-working professional who does the whole job for you and cleans up after.
        Here is how the competition stacks up as staff.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MASCOTS.map((m) => (
          <div
            key={m.name}
            className={`rounded-xl border p-4 ${
              m.butler ? "border-[#f97316] bg-orange-50" : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-3xl">{m.emoji}</div>
            <p className="mt-1 font-semibold text-slate-900">{m.name}</p>
            <p className="mt-1 text-xs text-slate-600">{m.body}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-7 text-lg font-semibold text-slate-900">Side-by-side comparison</h3>
      <p className="mt-1 text-xs text-slate-500">
        <span className="font-bold text-green-600">{"✓"} Yes</span>
        {"   "}
        <span className="font-bold text-amber-600">{"~"} Limited</span>
        {"   "}
        <span className="font-bold text-slate-400">{"✗"} Not offered (as of last review)</span>
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                Capability
              </th>
              <th className="border border-slate-200 bg-[#f97316] p-2 text-left font-semibold text-white">
                Influencer Butler
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                Oink
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                Viral Vue
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                Cha-Ching
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                Logie
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                JoyLink
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                ManyChat
              </th>
              <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">
                Deeplink tools
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.cap}>
                <td className="border border-slate-200 p-2 align-top text-slate-700">{r.cap}</td>
                <td className="border border-slate-200 bg-orange-50 p-2 align-top font-medium">
                  <Cell v={r.ib.v} t={r.ib.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.oink.v} t={r.oink.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.vue.v} t={r.vue.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.cha.v} t={r.cha.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.logie.v} t={r.logie.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.joy.v} t={r.joy.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.many.v} t={r.many.t} />
                </td>
                <td className="border border-slate-200 p-2 align-top">
                  <Cell v={r.deep.v} t={r.deep.t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-7 space-y-4">
        {COMPETITORS.map((c) => (
          <article key={c.name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{c.name}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {c.tag}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold">Their pitch: </span>
              {c.pitch}
            </p>
            <div className="mt-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-slate-700">
              <span className="font-semibold">Give them credit: </span>
              {c.credit}
            </div>
            <div className="mt-2 rounded-lg border-l-4 border-green-500 bg-green-50 p-3 text-sm text-slate-700">
              <span className="font-semibold">Where Butler wins: </span>
              {c.win}
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Talking points
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {c.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-white">
              {c.oneliner}
            </div>
          </article>
        ))}
      </div>

      <section className="mt-7 rounded-xl border-2 border-[#f97316]/40 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-[#f97316]">
          Your secret weapon
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          Lead with our free browser extension
        </h3>
        <p className="mt-2 text-sm text-slate-700">
          The competitors sell a browser extension. We give one away. Our free Chrome extension hands
          your audience the exact on-Amazon (and Walmart) intel that Oink, Viral Vue, and Logie
          charge $20 to $80 a month for: influencer vs brand vs customer video counts on any product,
          content gaps from their own order history, a Butler Approved opportunity seal, a one-click
          storefront checkup, plus search-grid and Best Sellers money signals, a profit calculator,
          price-drop watchlists, and a clean-a-link tool that strips someone else&apos;s affiliate
          tag.
          No account, no card, installs in one click, and it works across 12 Amazon marketplaces.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Why it is your best opener: a free install is the lowest-friction thing you can ask for, and
          the extension syncs into the full 40+ butler desktop suite. So a free user is a warm lead
          who upsells themselves into the paid app, which is where your recurring commission comes
          from.
        </p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Talking points
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Lead with the free tool. It costs your audience nothing and it sells the butler for you.</li>
          <li>
            &quot;The intel other extensions charge $30/mo for, free.&quot; That headline converts on
            its own.
          </li>
          <li>
            Once they connect a license key, the extension feeds the desktop app: a natural,
            no-pressure path to the paid subscription you earn on.
          </li>
        </ul>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your tracked free-extension link
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Send people here, not straight to the Chrome Web Store. This link credits you if they buy
            later, even after installing the free tool first.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              readOnly
              value={trackedExtLink}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
            />
            <button
              type="button"
              onClick={() => copy("ext-link", trackedExtLink)}
              className="shrink-0 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              {copied === "ext-link" ? "Copied!" : "Copy link"}
            </button>
          </div>
          {code ? null : (
            <p className="mt-2 text-xs text-amber-700">
              Your branded code is not set yet, so this is the plain link. Once your code appears on
              your dashboard, it will be baked in here automatically.
            </p>
          )}
        </div>
      </section>

      <h3 className="mt-7 text-lg font-semibold text-slate-900">Copy-paste captions</h3>
      <p className="mt-1 text-sm text-slate-600">
        Drop your tracked link on the end of any of these. They name no competitors on purpose, so
        they are safe to post as-is; if you name one in your own words, follow the rules above.
      </p>
      <div className="mt-3 space-y-3">
        {CAPTIONS.map((cap) => (
          <div key={cap.label} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {cap.label}
              </span>
              <button
                type="button"
                onClick={() => copy(cap.label, cap.text)}
                className="rounded-md bg-[#f97316] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
              >
                {copied === cap.label ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-700">{cap.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
        Competitor features and pricing change often. Every claim here is drawn from each
        company&apos;s public site as of the last review date. Before running a paid promo,
        spot-check the competitor&apos;s current site. Do not overstate a competitor&apos;s
        weakness: &quot;Limited&quot; means partial or unclear, not absent. Last reviewed:{" "}
        {LAST_REVIEWED}.
      </p>
    </section>
  );
}
