import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";

const SITE = "https://www.influencerbutler.com";

export const metadata: Metadata = {
  title: "About Liz Dean: 11 Years of Growth, Built Into One Tool",
  description:
    "Meet Liz Dean, full-time influencer since 2015 and founder of Influencer Butler. From building a 37,000-member community to coining Comment Pods to shipping a desktop app that automates it all.",
  alternates: { canonical: `${SITE}/about` },
  openGraph: {
    title: "About Liz Dean",
    description:
      "Full-time influencer since 2015. Community builder. Recovering script-hoarder. Founder of Influencer Butler.",
    url: `${SITE}/about`,
    type: "profile",
    siteName: "Influencer Butler",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Liz Dean",
    description:
      "Full-time influencer since 2015, now building the automation tool she wishes she'd always had.",
  },
};

const STORY = [
  {
    kicker: "The beginning",
    title: "It started with an obsession",
    body: [
      "I grew up on social media and, honestly, never grew out of it. Instagram became my favorite the moment I found it: the visual side of it collided with my love of photography and I was hooked. But I came at it from a different angle than most: my background is in software engineering and client support. So instead of just posting and hoping, I wanted to understand the mechanics of growth, and then teach them to everyone else.",
      "In 2015, in Salt Lake City, I started building a community from nothing. It became the Instagram Posse, and it grew into a home for 37,000+ influencers and marketers.",
    ],
  },
  {
    kicker: "The rise",
    title: "I didn't just teach it, I lived it",
    body: [
      "I A/B tested strategies on my own accounts every single day, growing @lizdean past 50,000 and @skirotica past 60,000 followers in under a year: no celebrity status, no brand name, no ad budget. Just strategy, consistency, and a lot of testing.",
      "That same year I coined and trademarked Comment Pods™: the idea that a small group of creators who genuinely showed up for each other could spark real engagement. It worked. It grew into 225+ niche pods, and the wider Instagram community noticed. Racked, Grazia, and other outlets covered what we were doing. I wrote a library of Instagram guides and helped 3,500+ creators, brands, and shops grow.",
    ],
  },
  {
    kicker: "The setback",
    title: "Then it all fell apart",
    body: [
      "The company I'd poured years into fell apart, not because the work stopped working, but because of a business partnership that ended in the worst way. I was locked out of the accounts I'd built, the money was gone, and I was left fighting to hold on to something that had my whole heart in it. Ultimately, I couldn't save it. It closed.",
      "I tried to rebuild it from scratch, while raising a toddler and a newborn at the same time. It was never quite the same. But I wasn't done.",
    ],
  },
  {
    kicker: "The rebuild",
    title: "Here's the thing nobody saw",
    body: [
      "I never actually stopped. For years I quietly ran hundreds of Instagram and Facebook accounts on autopilot: private scripts, Google Scripts, and a growing stack of tools I'd built for myself. It became second nature.",
      "And friends kept asking the same question: “Can you give me your scripts?”",
    ],
  },
  {
    kicker: "Today",
    title: "That question started everything new",
    body: [
      "Over the last two years I taught myself to build a real desktop app to package the systems I'd been running by hand for a decade. That build taught me more than I ever expected, and it's exactly what drives me now.",
      "My mission is simple: help people make money online through automation, so they can spend more time doing what they love with the people they love.",
    ],
  },
];

const STATS = [
  { value: "11 years", label: "growing and studying social media" },
  { value: "Since 2015", label: "a full-time influencer" },
  { value: "37,000+", label: "members in the community I built from zero" },
  { value: "225+", label: "niche engagement pods coordinated" },
  { value: "3,500+", label: "creators, brands, and shops helped" },
  { value: "50k+ & 60k+", label: "follower accounts grown in under a year" },
  { value: "Comment Pods™", label: "coined and trademarked in 2015" },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-orange-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
              About Liz
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              I&apos;ve spent 11 years figuring out how to grow on social media,
              and the last two building the tool I wish I&apos;d had the whole
              time.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-600">
              I&apos;m Liz Dean. Full-time influencer since 2015, community
              builder, recovering script-hoarder, and mom of two. I help people
              make money online with automation so they can spend less time
              grinding and more time with the people they love.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/go/trial?src=about-hero"
                className="inline-flex rounded-[14px] bg-orange-500 px-6 py-3 text-base font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-600"
              >
                Get started with Influencer Butler
              </Link>
              <Link
                href="#story"
                className="inline-flex rounded-[14px] border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-orange-400 hover:text-orange-600"
              >
                Read the story
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm lg:mx-0">
            <div className="relative overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-[0_20px_50px_-20px_rgba(249,115,22,0.45)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/Liz_Dean.png"
                alt="Liz Dean, founder of Influencer Butler"
                width={640}
                height={640}
                className="aspect-square w-full object-cover"
                loading="eager"
              />
            </div>
            <p className="mt-3 text-center text-sm font-medium text-slate-500">
              Liz Dean, founder of Influencer Butler
            </p>
          </div>
        </div>
      </section>

      {/* The Story */}
      <section id="story" className="scroll-mt-20 mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-600">
          The Story
        </p>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          From nothing, to a movement, to a tool
        </h2>

        <div className="mt-12 space-y-12">
          {STORY.map((chapter, i) => (
            <article key={chapter.kicker} className="relative">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-bold text-orange-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {chapter.kicker}
                </span>
              </div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {chapter.title}
              </h3>
              <div className="mt-4 space-y-4">
                {chapter.body.map((para, j) => (
                  <p key={j} className="text-lg leading-relaxed text-slate-600">
                    {para}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* By the Numbers */}
      <section className="border-y border-slate-200 bg-[#fafafa] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-600">
            By the Numbers
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            A decade of proof
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="text-3xl font-bold tracking-tight text-orange-500">
                  {stat.value}
                </div>
                <p className="mt-2 text-sm text-slate-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-600">
          Mission
        </p>
        <blockquote className="mt-6 text-center text-2xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-3xl">
          I&apos;m a regular person who figured out the systems: no shortcuts, no
          gatekeeping. Everything I build now is about handing those systems to
          you, on autopilot, so growing online stops eating the time you&apos;d
          rather spend living your life.
        </blockquote>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-white to-orange-50">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Want the systems I spent a decade building?
          </h2>
          <div className="mt-8">
            <Link
              href="/go/trial?src=about-cta"
              className="inline-flex rounded-[14px] bg-orange-500 px-8 py-3.5 text-base font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-600"
            >
              Get started with Influencer Butler →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
