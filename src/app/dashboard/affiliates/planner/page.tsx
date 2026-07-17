"use client";

// Affiliate Content Planner: a resource hub affiliates can use to plan and
// schedule their promo content, even before Lemon Squeezy activates them.
// Pill-filtered content ideas (mirrors the marketing site's feature pills),
// plus an email funnel, a 14-day calendar starter, and a ready-asset library.
// KEEP CURRENT: when a new butler/feature ships, add a content idea for it.
// Last reviewed: 2026-07-04

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BUTLERS, CATEGORIES, type Category } from "./engagementPosts";

type Idea = {
  feature: string;
  cat: Category;
  hook: string;
  caption: string;
  visual?: string; // path under /public
};

const IDEAS: Idea[] = [
  {
    feature: "Free Chrome extension",
    cat: "Amazon Automation",
    hook: "The Amazon intel other tools charge $30/mo for, free.",
    caption:
      "Our free Chrome extension shows how many influencer videos any Amazon product has, finds content gaps hiding in your own order history, and flags the products actually worth filming, right in your browser. No account, no card, one-click install. It is the easiest yes I can offer, and it is the front door to the whole butler:",
    visual: "/assets/extension/extension_product_page_view_version_1.0.png",
  },
  {
    feature: "Daily Commission Butler",
    cat: "Amazon Automation",
    hook: "Stop leaving Creator Connections money on the table.",
    caption:
      "Every hour you don't catch a matching CC campaign is money gone. Daily Commission Butler auto-accepts Creator Connections AND Sponsored Products CC offers from products you already sold, in the background. I woke up to accepted campaigns I never would have caught. Free 14-day trial:",
    visual: "/assets/before_after_flagship_feature_1.png",
  },
  {
    feature: "Amazon Butler (brand outreach)",
    cat: "Amazon Automation",
    hook: "Message 100 brands without lifting a finger.",
    caption:
      "I used to spend hours messaging brands on Creator Connections one by one. Amazon Butler sends your outreach with rotating templates and auto follow-ups, at a safe pace, while I make content. Set it once and let it run:",
    visual: "/assets/features/brand_messages.gif",
  },
  {
    feature: "CC Check (grab every ASIN)",
    cat: "Amazon Automation",
    hook: "Grab every ASIN from any page in seconds.",
    caption:
      "Paste any storefront, blog post, or competitor list and CC Check pulls every Amazon product code instantly. No more clicking through 50 products. This one is free forever:",
    visual: "/assets/features/cc-check-carousel-1.png",
  },
  {
    feature: "Orders Butler",
    cat: "Amazon Automation",
    hook: "Turn your Amazon order history into content ideas.",
    caption:
      "Orders Butler harvests your Amazon order history back to 2013 and maps what you already bought to content you could make. Your next 20 videos are hiding in your own purchases:",
    visual: "/assets/features/orders-butler-hero.png",
  },
  {
    feature: "Instagram Butler",
    cat: "Social & Outreach",
    hook: "Auto-DM your followers your storefront link.",
    caption:
      "Instagram Butler sends DMs to your followers with your own templates and built-in speed controls, so your storefront gets in front of the people who already follow you. Hands-off outreach:",
    visual: "/assets/features/instagram-butler-hero.png",
  },
  {
    feature: "Messenger Butler",
    cat: "Social & Outreach",
    hook: "One tidy inbox for every brand conversation.",
    caption:
      "No more digging through your Amazon inbox like a trough. Messenger Butler pulls every brand thread into one tagged view: who shipped, who's negotiating, what to create next, with the ASIN pulled for you:",
    visual: "/assets/features/messenger-butler-hero.png",
  },
  {
    feature: "Like Butler (free forever)",
    cat: "Social & Outreach",
    hook: "A free tool that likes storefronts for you.",
    caption:
      "Like Butler auto-likes storefront posts on a schedule at a safe pace, so you stop tapping hearts all day. It's free forever, no trial needed. Great first taste of what Butler does:",
  },
  {
    feature: "Deals Influencer Butler",
    cat: "Content & Deals",
    hook: "Post your deals to 5 platforms on autopilot.",
    caption:
      "Deals Influencer Butler finds the deals, injects your promo codes, writes the captions, and auto-posts to Instagram, Threads, Facebook groups and pages, Telegram, and Reddit on a schedule. Set it up once and wake up to posted deals:",
    visual: "/assets/before_and_after_stress_influencer_butler_vertical.png",
  },
  {
    feature: "Video Reload Butler",
    cat: "Content & Deals",
    hook: "Reload deleted videos to 5 countries.",
    caption:
      "Amazon pulled your video? Video Reload Butler restores it, refreshes the title, flips horizontal to vertical, and reloads it to the US, Canada, UK, Australia, and Singapore. One recording, five storefronts:",
    visual: "/assets/features/video-reload-butler-hero.png",
  },
  {
    feature: "Photo Reload Butler",
    cat: "Content & Deals",
    hook: "Fan your photos across international storefronts.",
    caption:
      "Photo Reload Butler re-posts your US storefront photos to Canada, UK, Australia, and Singapore with fresh tags, and reloads photos Amazon removed. Most tools do videos only, this does photos too:",
    visual: "/assets/features/photo-reload-butler-1.png",
  },
  {
    feature: "Retag Butler",
    cat: "Content & Deals",
    hook: "Revive dead product links in your old content.",
    caption:
      "That old video earning $0 because Amazon took the product down? Retag Butler finds it and adds a live replacement link without wiping your original tag. Up to 500 pieces per run. Found money:",
  },
  {
    feature: "Voiceover Butler",
    cat: "Content & Deals",
    hook: "AI voiceover scripts in your own voice and niche.",
    caption:
      "Voiceover Butler writes voiceover scripts in your tone and niche with FTC disclosures baked in and brand-safety guards on every line. Film faster without staring at a blank page:",
    visual: "/assets/features/voiceover-butler-1.png",
  },
  {
    feature: "Earnings Intelligence",
    cat: "Earnings & Growth",
    hook: "See exactly which products actually pay you.",
    caption:
      "Stop squinting at Amazon's dashboard. Earnings Intelligence shows lifetime earnings per product by source, surfaces your top earners, and even resurfaces winners that started paying again. Promote what actually works:",
  },
  {
    feature: "Goldmine Butler + Ads Goldmine",
    cat: "Earnings & Growth",
    hook: "Find brands that are already paying creators.",
    caption:
      "Goldmine Butler scans other creators' storefronts for paid-content signals and hands you the brand names, ASINs, and titles. Ads Goldmine surfaces products Amazon is actively pushing. A warm lead list, done for you:",
    visual: "/assets/features/ads-goldmine-hero.png",
  },
  {
    feature: "The competitor angle",
    cat: "Earnings & Growth",
    hook: "Why creators fire the extensions and hire the butler.",
    caption:
      "The browser extensions and research tools each do a piece of the job. Influencer Butler does the whole job: messaging brands, tracking every deal from shipped to filmed to paid, reviving old content, and posting to 5 platforms while you sleep. Stop renting tools:",
    visual: "/assets/affiliate-competitor-butler-vs-extensions.png",
  },
];

type Email = { step: string; subject: string; body: string };

const FUNNEL: Email[] = [
  {
    step: "Email 1 · Welcome",
    subject: "The tool that gave me my evenings back",
    body:
      "Open by sharing your own before/after: how many hours a week the Amazon grind used to eat. Introduce Influencer Butler as a desktop app that does the busywork for you. Give them a no-friction first step: the free Chrome extension (no card) via your tracked link, then a soft CTA to the free 14-day trial of the full app.",
  },
  {
    step: "Email 2 · Problem + agitate",
    subject: "You're leaving commissions on the table (here's proof)",
    body:
      "Name the pain: missed Creator Connections campaigns, dead links in old videos, posting deals by hand. Explain that these are silent money leaks. Tease that automation fixes all three. CTA to the trial.",
  },
  {
    step: "Email 3 · Feature spotlight",
    subject: "How my brand deals track themselves now",
    body:
      "Walk through the lifecycle: message a brand, it becomes a tracked card, the inbox tags when it ships and what to film, and it lands in lifetime earnings. Auto-accept CC + SPCC in the background. CTA to the trial.",
  },
  {
    step: "Email 4 · Social proof + comparison",
    subject: "Butler vs. the browser extensions",
    body:
      "Share the comparison: extensions make you click faster, Butler does the clicking for you across Amazon AND social. Drop the comparison graphic and a short testimonial or your own result. CTA to the trial.",
  },
  {
    step: "Email 5 · Urgency + CTA",
    subject: "Last nudge: start your free 3 days",
    body:
      "Recap the three biggest wins (auto-accept, deal auto-posting, reviving old content). Remind them the trial is free for 14 days and they can cancel before day 14. Strong single CTA to your link.",
  },
];

const CALENDAR: { day: string; focus: string; platform: string }[] = [
  { day: "Day 1", focus: "Your before/after story (the grind vs. now)", platform: "Reel / TikTok" },
  { day: "Day 2", focus: "Daily Commission Butler auto-accept", platform: "Story + link" },
  { day: "Day 3", focus: "Free Chrome extension: video counts + content gaps (free forever)", platform: "Reel" },
  { day: "Day 4", focus: "Email 1 to your list", platform: "Email" },
  { day: "Day 5", focus: "Messenger Butler tidy inbox", platform: "Carousel" },
  { day: "Day 6", focus: "Deals Influencer Butler 5-platform auto-post", platform: "Reel" },
  { day: "Day 7", focus: "Weekend: competitor comparison graphic", platform: "Feed post" },
  { day: "Day 8", focus: "Email 2 to your list", platform: "Email" },
  { day: "Day 9", focus: "Retag Butler found-money angle", platform: "Story" },
  { day: "Day 10", focus: "Video + Photo Reload (intl storefronts)", platform: "Reel" },
  { day: "Day 11", focus: "Earnings Intelligence top-earners", platform: "Carousel" },
  { day: "Day 12", focus: "Email 3 to your list", platform: "Email" },
  { day: "Day 13", focus: "Your honest week-1 results with Butler", platform: "Reel" },
  { day: "Day 14", focus: "Urgency: free trial + your code (Email 5)", platform: "Email + Story" },
];

const ASSETS: { label: string; path: string; note: string }[] = [
  {
    label: "Butler vs. extensions comparison",
    path: "/assets/affiliate-competitor-butler-vs-extensions.png",
    note: "Great for the comparison / competitor angle.",
  },
  {
    label: "Before / after stress (vertical)",
    path: "/assets/before_and_after_stress_influencer_butler_vertical.png",
    note: "Reels and Stories. The grind vs. calm.",
  },
  {
    label: "Before / after stress (Facebook)",
    path: "/assets/before_and_after_stress_influencer_butler_facebook.png",
    note: "Feed posts in Facebook groups and pages.",
  },
  {
    label: "Grab every ASIN (flagship)",
    path: "/assets/before_after_flagship_feature_1.png",
    note: "CC Check / auto-accept posts.",
  },
];

export default function AffiliatePlannerPage() {
  const [active, setActive] = useState<Category | "All">("All");
  const [activeButler, setActiveButler] = useState<string>("All");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  const shown = useMemo(
    () => (active === "All" ? IDEAS : IDEAS.filter((i) => i.cat === active)),
    [active],
  );

  const shownButlers = useMemo(
    () => (activeButler === "All" ? BUTLERS : BUTLERS.filter((b) => b.slug === activeButler)),
    [activeButler],
  );
  const shownPostCount = shownButlers.reduce((sum, b) => sum + b.posts.length, 0);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate resources
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Content Planner
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Plan and schedule your promo content here, then just drop your tracked link in as soon as
          you are approved. Hooks, captions, an email funnel, a 14-day calendar, and ready-made
          graphics, all in one place.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          {[
            ["#content-ideas", "Content ideas"],
            ["#engagement", "Engagement posts"],
            ["#email-funnel", "Email funnel"],
            ["#calendar", "14-day calendar"],
            ["#graphics", "Graphics"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 transition hover:border-[#f97316] hover:text-[#f97316]"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Waiting on approval? Get a head start.</p>
        <p className="mt-1 text-sm text-slate-700">
          You do not have to wait to plan. Write your captions, line up your calendar, and queue your
          posts now. The moment your tracked link appears on your dashboard, you paste it in and go
          live the same day. Affiliates who plan during the wait launch faster and earn sooner.
        </p>
        <Link
          href="/dashboard/affiliates"
          className="mt-3 inline-flex items-center text-sm font-semibold text-[#f97316] hover:text-[#ea580c]"
        >
          Back to your affiliate dashboard
        </Link>
      </section>

      <section id="content-ideas" className="scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Content ideas</h2>
          <span className="text-xs text-slate-500">{shown.length} ideas</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Filter by focus, the same way our features page does. Every card has a hook, a copy-paste
          caption, and a suggested visual.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <PillButton label="All" count={IDEAS.length} active={active === "All"} onClick={() => setActive("All")} />
          {CATEGORIES.map((c) => (
            <PillButton
              key={c}
              label={c}
              count={IDEAS.filter((i) => i.cat === c).length}
              active={active === c}
              onClick={() => setActive(c)}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {shown.map((idea) => (
            <article
              key={idea.feature}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              {idea.visual ? (
                <div className="relative aspect-video w-full bg-slate-50">
                  <Image
                    src={idea.visual}
                    alt={`${idea.feature} visual`}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 400px"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-[#c2410c]">
                    {idea.cat}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{idea.feature}</span>
                </div>
                <p className="mt-2 text-base font-semibold text-slate-900">{idea.hook}</p>
                <p className="mt-2 flex-1 text-sm text-slate-600">{idea.caption}</p>
                <div className="mt-3 flex items-center justify-between">
                  {idea.visual ? (
                    <span className="truncate text-[11px] text-slate-400">Visual: {idea.visual.replace("/assets/", "")}</span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Pair with a screen recording</span>
                  )}
                  <button
                    type="button"
                    onClick={() => copy(idea.feature, idea.caption)}
                    className="rounded-md bg-[#f97316] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
                  >
                    {copied === idea.feature ? "Copied!" : "Copy caption"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="engagement" className="scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Facebook engagement posts</h2>
          <span className="text-xs text-slate-500">{shownPostCount} posts</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Comment-driving posts for your Facebook groups, 10 per butler. Pick a butler below to see
          just its posts (Reveals, Relatable moments, and Interactive prompts). Pair each with the
          suggested screenshot, then copy the caption straight into your post.
        </p>

        <div className="sticky top-0 z-30 mt-4 rounded-xl border border-slate-200 bg-white/90 px-3 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-1.5">
            <ButlerChip
              label={`All butlers (${BUTLERS.length})`}
              active={activeButler === "All"}
              onClick={() => setActiveButler("All")}
            />
          </div>
          {CATEGORIES.map((c) => (
            <div key={c} className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {c}
              </span>
              {BUTLERS.filter((b) => b.cat === c).map((b) => (
                <ButlerChip
                  key={b.slug}
                  label={b.name}
                  active={activeButler === b.slug}
                  onClick={() => setActiveButler(b.slug)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-10">
          {shownButlers.map((butler) => (
            <div key={butler.slug} id={butler.slug} className="scroll-mt-40">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-[#c2410c]">
                    {butler.cat}
                  </span>
                  <h3 className="mt-1 text-base font-bold text-slate-900">{butler.name}</h3>
                  <p className="text-xs text-slate-500">{butler.blurb}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">{butler.posts.length} posts</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {butler.posts.map((post) => (
                  <article
                    key={post.title}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-[#c2410c]">
                        {post.type}
                      </span>
                    </div>
                    <p className="mt-2 text-base font-semibold text-slate-900">{post.title}</p>
                    <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                      📸 Screenshot: {post.screenshot}
                    </p>
                    <p className="mt-2 flex-1 whitespace-pre-line text-sm text-slate-600">{post.caption}</p>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => copy(`${butler.slug}-${post.title}`, post.caption)}
                        className="rounded-md bg-[#f97316] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
                      >
                        {copied === `${butler.slug}-${post.title}` ? "Copied!" : "Copy caption"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="email-funnel" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Email funnel starter</h2>
        <p className="mt-1 text-sm text-slate-600">
          A 5-email sequence you can adapt to your voice. Space them 2 to 3 days apart and put your
          tracked link on every CTA.
        </p>
        <div className="mt-4 space-y-3">
          {FUNNEL.map((e) => (
            <div key={e.step} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">
                  {e.step}
                </span>
                <button
                  type="button"
                  onClick={() => copy(e.step, `Subject: ${e.subject}\n\n${e.body}`)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  {copied === e.step ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">Subject: {e.subject}</p>
              <p className="mt-1 text-sm text-slate-600">{e.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="calendar" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">14-day launch calendar</h2>
        <p className="mt-1 text-sm text-slate-600">
          A starter cadence mixing short video, Stories, carousels, and email. Shift it to fit your
          posting schedule.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">Day</th>
                <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">Focus</th>
                <th className="border border-slate-200 bg-slate-800 p-2 text-left font-semibold text-white">Format</th>
              </tr>
            </thead>
            <tbody>
              {CALENDAR.map((row) => (
                <tr key={row.day}>
                  <td className="border border-slate-200 p-2 font-medium text-slate-700">{row.day}</td>
                  <td className="border border-slate-200 p-2 text-slate-700">{row.focus}</td>
                  <td className="border border-slate-200 p-2 text-slate-500">{row.platform}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="graphics" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Ready-made graphics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Right-click and save any of these to use in your posts. More feature images live in the
          feature pages on our site.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ASSETS.map((a) => (
            <a
              key={a.path}
              href={a.path}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-slate-200 p-3 shadow-sm transition hover:border-[#f97316]"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-50">
                <Image src={a.path} alt={a.label} fill className="object-contain" sizes="200px" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">{a.label}</p>
              <p className="text-xs text-slate-500">{a.note}</p>
            </a>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Want a specific angle or graphic made? Email{" "}
        <a
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-[#f97316] hover:text-[#ea580c]"
        >
          hello@influencerbutler.com
        </a>{" "}
        and we will build it for you.
      </div>
    </div>
  );
}

function PillButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? "border-[#f97316] bg-[#f97316] text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:border-[#f97316] hover:text-[#f97316]"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] ${
          active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ButlerChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? "border-[#f97316] bg-[#f97316] text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-[#f97316] hover:text-[#f97316]"
      }`}
    >
      {label}
    </button>
  );
}
