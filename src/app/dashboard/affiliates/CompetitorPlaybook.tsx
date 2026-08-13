"use client";

// Affiliate Competitor Playbook: accurate comparisons affiliates can use to
// promote Influencer Butler against Oink, Viral Vue, Cha-Ching Automate, and Logie.
// KEEP CURRENT: update the table/copy when we ship new butlers, and refresh
// competitor rows weekly. See the app repo's "Keep the affiliate
// competitor-analysis materials current" note and the weekly scheduled task.
// Last reviewed: 2026-08-13

import Image from "next/image";
import { useState } from "react";

// Every competitor claim in this file is "as of" this date. Update it every
// time the rows/copy are re-verified against the competitors' live sites.
const LAST_REVIEWED = "August 13, 2026";

type Verdict = "yes" | "ltd" | "no" | "text";

type Row = {
  cap: string;
  ib: { v: Verdict; t?: string };
  oink: { v: Verdict; t?: string };
  vue: { v: Verdict; t?: string };
  cha: { v: Verdict; t?: string };
  logie: { v: Verdict; t?: string };
};

const ROWS: Row[] = [
  {
    cap: "Product type",
    ib: { v: "text", t: "Desktop app (Win/Mac)" },
    oink: { v: "text", t: "Chrome extension" },
    vue: { v: "text", t: "Extension + web app" },
    cha: { v: "text", t: "Desktop app" },
    logie: { v: "text", t: "Extension + web portal" },
  },
  {
    cap: "Entry price",
    ib: { v: "text", t: "$39/mo (14-day trial)" },
    oink: { v: "text", t: "$29.99/mo (free tier)" },
    vue: { v: "text", t: "$39/mo (free tier)" },
    cha: { v: "text", t: "$20/mo" },
    logie: { v: "text", t: "$0 free / $49.75+/mo" },
  },
  {
    cap: "Number of tools",
    ib: { v: "text", t: "40+ connected" },
    oink: { v: "text", t: "40+" },
    vue: { v: "text", t: "Several" },
    cha: { v: "text", t: "1 (video sync)" },
    logie: { v: "text", t: "AI suite (credit-metered)" },
  },
  {
    cap: "Free browser extension (video counts, gaps, seal, storefront)",
    ib: { v: "yes", t: "free forever" },
    oink: { v: "ltd", t: "free tier" },
    vue: { v: "ltd", t: "free tier" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "free tier, score cap 60" },
  },
  {
    cap: "Auto-accept Creator Connections",
    ib: { v: "yes", t: "CC + SPCC" },
    oink: { v: "ltd", t: "CC scan" },
    vue: { v: "yes", t: "CC" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "CC visibility + reminders" },
  },
  {
    cap: "Automated brand outreach + follow-ups",
    ib: { v: "yes" },
    oink: { v: "yes" },
    vue: { v: "yes", t: "AI" },
    cha: { v: "no" },
    logie: { v: "yes", t: "AI" },
  },
  {
    cap: "End-to-end deal lifecycle (outreach to board to inbox to calendar to paid)",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "tracker" },
    vue: { v: "ltd", t: "tracker" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "inbox CRM" },
  },
  {
    cap: "Unified, tagged Amazon inbox",
    ib: { v: "yes" },
    oink: { v: "ltd" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "yes", t: "Inbox CRM" },
  },
  {
    cap: "Content calendar / coverage matrix",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "scheduler" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "content dashboard" },
  },
  {
    cap: "Revive dead product links in old content",
    ib: { v: "yes", t: "up to 500/run" },
    oink: { v: "ltd" },
    vue: { v: "yes" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "detects broken ASINs" },
  },
  {
    cap: "Re-upload deleted videos",
    ib: { v: "yes", t: "US/CA/UK/AU/SG" },
    oink: { v: "ltd" },
    vue: { v: "ltd" },
    cha: { v: "yes", t: "YouTube + 13 intl" },
    logie: { v: "no" },
  },
  {
    cap: "Re-post photos to international storefronts",
    ib: { v: "yes", t: "CA/UK/AU/SG" },
    oink: { v: "ltd", t: "CA/UK/AU" },
    vue: { v: "no" },
    cha: { v: "no", t: "video only" },
    logie: { v: "ltd", t: "Amazon CA/UK publish" },
  },
  {
    cap: "Multi-platform deal auto-posting (IG, Threads, FB, Telegram, Reddit)",
    ib: { v: "yes" },
    oink: { v: "ltd", t: "bulk FB" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "YouTube/Pinterest" },
  },
  {
    cap: "AI product photo / thumbnail generation",
    ib: { v: "no" },
    oink: { v: "no" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "yes", t: "shoppable photos + thumbnails" },
  },
  {
    cap: "Product research database",
    ib: { v: "ltd", t: "Goldmine/Ads" },
    oink: { v: "ltd" },
    vue: { v: "yes", t: "30M+ products" },
    cha: { v: "no" },
    logie: { v: "ltd", t: "X-Ray search" },
  },
  {
    cap: "Lifetime earnings per product",
    ib: { v: "yes" },
    oink: { v: "yes" },
    vue: { v: "yes" },
    cha: { v: "no" },
    logie: { v: "ltd" },
  },
  {
    cap: "Instagram DMs / Close Friends / auto-like",
    ib: { v: "yes" },
    oink: { v: "no" },
    vue: { v: "no" },
    cha: { v: "no" },
    logie: { v: "no" },
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
      "40+ in-browser Amazon tools (cross-checks, earnings tracker, collaboration tracker, brand messaging, auto-scan, bulk Facebook posting, Canada/UK/Australia cross-posting), plus an 'Agent Oink' AI assistant on Pro. Free tier and a mature tool set.",
    credit:
      "Oink is a genuinely capable extension with a free tier and a lower entry price. If someone only lives inside Amazon in their browser, it does a lot.",
    win:
      "As of our last check, Oink is a drawer of separate tools you operate one at a time, in one browser tab. Influencer Butler is a connected desktop system: outreach becomes a tracked collab card automatically, the inbox tags when a product ships and what to film next, and deals auto-post across five social platforms. It also reaches past Amazon into Instagram, YouTube, Pinterest, and more.",
    points: [
      "An extension speeds up your clicking. A butler does the clicking for you.",
      "Oink hands you tools. Butler connects them so a brand deal tracks itself from shipped to filmed to paid.",
      "Butler does not stop at the edge of Amazon: it posts your deals to Instagram, Threads, Facebook, Telegram, and Reddit too.",
    ],
    oneliner: "\u{1F437} Oink is a pig pen you clean yourself. \u{1F933} Butler is the staff that cleans up for you.",
  },
  {
    name: "Viral Vue",
    tag: "Extension + web app · $39/mo, free tier",
    pitch:
      "Data-first product research on 30M+ products, plus Creator Connection auto-accept, AI brand-deal outreach, storefront optimizer, profits dashboard, and revive-dead-product tools. “Stop guessing what converts.”",
    credit:
      "Viral Vue's product-research database is a real strength. For pure discovery of what to add to your storefront, their data depth is a legitimate selling point.",
    win:
      "As of our last check, Viral Vue tells you what to promote, then leaves most of the doing to you. Influencer Butler runs the whole workflow: it accepts CC and SPCC, tracks each brand deal end to end, revives dead links, re-uploads videos AND photos to international storefronts, and auto-posts your deals across five platforms. Research is one step; Butler automates the other twenty.",
    points: [
      "Viral Vue is a research assistant. Butler is the whole staff that acts on the research.",
      "Great, you found a winning product. Butler is what tracks the deal, films the coverage list, and posts it everywhere while you sleep.",
      "Butler handles photos and videos, Instagram, and deal posting, not just product picks.",
    ],
    oneliner: "\u{1F440} Viral Vue hands you a clipboard. \u{1F933} Butler does the shift.",
  },
  {
    name: "Cha-Ching Automate",
    tag: "Desktop app · $20/mo",
    pitch:
      "One job, done well: syncs your Amazon Influencer videos to YouTube and cross-posts them to 13+ international Amazon storefronts, auto-transcribing, translating, and captioning per country. Auto affiliate links, thumbnail sync, playlists, scheduling.",
    credit:
      "For video specifically, Cha-Ching reaches more countries (13+) and auto-translates and captions in the local language, which Butler's Video Reload does not do today. If a creator's only goal is multilingual video-to-YouTube at scale, Cha-Ching is strong at that one thing.",
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
      "AI-first Amazon suite: X-Ray Super Search, an Opportunity Score + Sales Rank, Creator Connections visibility and reminders, a brand Inbox CRM, sample requests, AI shoppable photos/collages/thumbnails, AI Pinterest posts, auto-publish to YouTube/Pinterest/Amazon CA-UK, smart deep links, and weekly Zoom training. Everything is credit-metered with a per-tier score cap.",
    credit:
      "Logie's AI image generation (shoppable photos, collages, thumbnails) is a real, unique strength that Butler does not have today. Its brand Inbox CRM and weekly live training are legit too.",
    win:
      "As of our last check, Logie meters nearly every action by credits and caps your Opportunity Score by tier (the free browser intel tops out at 60/100). Influencer Butler runs the whole deal lifecycle end to end, auto-posts your deals across five social platforms, and reaches past Amazon into Instagram, and its browser extension is free with no credits and no score cap.",
    points: [
      "Logie charges you credits and caps your score by plan. Butler's free extension is uncapped, no credits, no meter.",
      "Logie auto-posts to YouTube and Pinterest. Butler posts your deals to Instagram, Threads, Facebook, Telegram, and Reddit too.",
      "Butler also revives your dead product links and reloads both your videos AND your photos to international storefronts.",
    ],
    oneliner: "\u{1F3A8} Logie paints you a pretty photo. \u{1F933} Butler runs the whole business.",
  },
];

const CAPTIONS: { label: string; text: string }[] = [
  {
    label: "Short",
    text: "The paid browser extensions and research tools each do a piece of the job. Influencer Butler does the whole job: messaging brands, tracking every deal from shipped to filmed to paid, reviving old content, and auto-posting your deals to 5 platforms while you sleep. Stop renting tools. Hire the butler.",
  },
  {
    label: "Free tool",
    text: "The Amazon intel other extensions charge $30/mo for? Influencer Butler gives it to you free. See how many influencer videos any product has, find content gaps in your own orders, and spot the products worth filming, right in your browser. No card, installs in one click:",
  },
  {
    label: "Story / Reel",
    text: "An extension makes YOU click faster. A butler clicks for you. Influencer Butler is a desktop app that auto-accepts your Creator Connections + Sponsored Products campaigns, tracks every brand collab end to end, and posts your deals across Instagram, Threads, Facebook, Telegram, and Reddit on autopilot. Free 14-day trial.",
  },
  {
    label: "Comparison hook",
    text: "I compared the top Amazon creator tools. The paid extensions = tools you run by hand. The research tools = great data, you still do the work. The single-purpose apps = one job only. Influencer Butler = the whole job, done for you (and its browser extension is free). Here is the breakdown.",
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
        <table className="w-full min-w-[880px] border-collapse text-sm">
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
          your audience the exact on-Amazon intel Oink and Viral Vue charge $25 to $50 a month for:
          influencer vs brand vs customer video counts on any product, content gaps from their own
          order history, a Butler Approved opportunity seal, and a one-click storefront checkup. No
          account, no card, installs in one click.
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
