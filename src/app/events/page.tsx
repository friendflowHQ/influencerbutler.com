/**
 * Public explainer + listing for the live group-call events system. Unlike
 * /events/[id] (a per-event share card), this is the generic page a
 * prospect lands on before any specific event exists yet, so it's the only
 * place the events system gets explained at all.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import { getAdmin, listUpcomingEvents, type EventRow } from "@/lib/events";
import { formatEventDate, formatEventTime } from "@/lib/event-image-text";

export const dynamic = "force-dynamic";

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

export const metadata: Metadata = {
  title: "Live Group Calls & Events",
  description:
    "Free live group calls with the Influencer Butler team: ask questions, get a recorded replay and an AI-written recap by email, free for every account. No Pro upgrade required to join.",
  alternates: { canonical: `${SITE}/events` },
  openGraph: {
    title: "Live Group Calls & Events",
    description:
      "Free live group calls with the Influencer Butler team. Recorded, recapped by AI, and emailed to everyone who registers.",
    url: `${SITE}/events`,
    type: "website",
    siteName: "Influencer Butler",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Group Calls & Events",
    description: "Free live group calls with the Influencer Butler team, open to every account.",
  },
};

const WHAT_YOU_GET = [
  {
    title: "Free for every account",
    body: "No Pro upgrade required. Any signed-in account, free or paying, can register and join.",
  },
  {
    title: "Reminders built in",
    body: "Automatic email reminders at 24 hours and 1 hour before the call, plus one-click Google Calendar or .ics add.",
  },
  {
    title: "Recorded and transcribed",
    body: "Calls run on Google Meet with live recording and transcription, so you don't have to choose between attending and taking notes.",
  },
  {
    title: "AI recap, emailed automatically",
    body: "Once the call ends, every registrant gets an email with a summary, the topics covered, action items, and follow-ups, generated from the transcript.",
  },
  {
    title: "Replay available after",
    body: "Can't make it live? A replay link goes out by email once it's ready, so missing the call doesn't mean missing the content.",
  },
  {
    title: "Not a sales call",
    body: "These are live Q&A and office-hours style sessions hosted by the Influencer Butler team, not a demo or a pitch.",
  },
];

const FAQ = [
  {
    q: "Do I need to be on a Pro plan to join?",
    a: "No. Registration only requires a signed-in account. Free, trial, and paying accounts can all register and attend.",
  },
  {
    q: "What if I can't make it live?",
    a: "Register anyway. A replay link is emailed to every registrant once it's ready after the call, along with the AI-generated recap.",
  },
  {
    q: "Is the call recorded?",
    a: "When recording is enabled for an event, yes. You'll see a recording notice on that event's page before you register, and the replay and clips may be shared publicly, including on our website, YouTube, and social media.",
  },
  {
    q: "Is this the same as booking a 1:1 call?",
    a: "No. These are live group calls open to everyone who registers. A 1:1 call with support is a separate, separately-booked flow in your dashboard.",
  },
];

function EventCard({ event }: { event: EventRow }) {
  const dateLine = formatEventDate(event.startsAt, event.timezone);
  const timeLine = formatEventTime(event.startsAt, event.endsAt, event.timezone);

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-orange-300 hover:shadow-md"
    >
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt={`${event.title} event cover`}
          className="aspect-[1200/630] w-full object-cover"
        />
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#c2410c]">Live event</p>
        <h3 className="mt-1.5 text-lg font-bold text-slate-900">{event.title}</h3>
        {dateLine ? (
          <p className="mt-2 text-sm font-medium text-slate-700">
            {dateLine}
            {timeLine ? `, ${timeLine}` : ""}
          </p>
        ) : null}
        {event.description ? (
          <p className="mt-2 line-clamp-3 text-sm text-slate-600">{event.description}</p>
        ) : null}
        <span className="mt-4 text-sm font-semibold text-orange-700">See details and register &rarr;</span>
      </div>
    </Link>
  );
}

export default async function EventsPage() {
  const admin = getAdmin();
  const upcoming = admin ? await listUpcomingEvents(admin, 12) : [];

  return (
    <main id="main-content" className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-orange-50 to-white">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">
            Events
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Live group calls, free for every account
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            The Influencer Butler team runs live group calls to answer questions and walk through
            what's new. Every call is recorded, every registrant gets an AI-written recap by
            email, and you don't need a Pro plan to join.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/go/trial?src=events-hero"
              className="inline-flex rounded-[14px] bg-orange-700 px-6 py-3 text-base font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-800"
            >
              Get started with Influencer Butler
            </Link>
            <Link
              href="/dashboard/events"
              className="inline-flex rounded-[14px] border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-orange-400 hover:text-orange-700"
            >
              See your upcoming events
            </Link>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-700">
          What you get
        </p>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Not a webinar funnel, a real live call
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WHAT_YOU_GET.map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming events */}
      <section className="border-y border-slate-200 bg-[#fafafa] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-700">
            Upcoming
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            What's scheduled
          </h2>
          {upcoming.length > 0 ? (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-base font-semibold text-slate-900">Nothing on the calendar right now</p>
              <p className="mt-2 text-sm text-slate-600">
                Register your account and we'll email you as soon as the next one is scheduled.
              </p>
              <Link
                href="/go/trial?src=events-empty-state"
                className="mt-5 inline-flex rounded-[14px] bg-orange-700 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-800"
              >
                Get started with Influencer Butler
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-700">
          FAQ
        </p>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-10 divide-y divide-slate-200 border-t border-slate-200">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                {item.q}
              </summary>
              <p className="mt-2 text-sm text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-white to-orange-50">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Join the next call
          </h2>
          <p className="mt-4 text-base text-slate-600">
            Create a free account and you'll see every upcoming event in your dashboard.
          </p>
          <div className="mt-8">
            <Link
              href="/go/trial?src=events-cta"
              className="inline-flex rounded-[14px] bg-orange-700 px-8 py-3.5 text-base font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-800"
            >
              Get started with Influencer Butler &rarr;
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
