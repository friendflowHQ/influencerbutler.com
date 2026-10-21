/**
 * Public share page for a group event: /events/<id>. Shows the branded cover
 * image, title, date, time, and description with a "Register" call to action
 * into the dashboard. Its whole reason to exist is a real og:image / Twitter
 * card so pasting the link into social or chat unfurls the branded image (the
 * dashboard events page is auth-gated, so scrapers can never see it there).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, getEvent, listSeriesEvents, type EventRow } from "@/lib/events";
import { formatEventDate, formatEventTime } from "@/lib/event-image-text";
import { RECORDING_CONSENT_NOTICE } from "@/lib/event-consent";
import RegisterButton from "./RegisterButton";

export const dynamic = "force-dynamic";

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

// A public, shareable event is one that exists and is not cancelled.
async function loadShareableEvent(id: string): Promise<EventRow | null> {
  const admin = getAdmin();
  if (!admin) return null;
  const event = await getEvent(admin, id);
  if (!event || event.status === "cancelled") return null;
  return event;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await loadShareableEvent(id);
  if (!event) return { title: "Event not found | Influencer Butler" };

  const when = [
    formatEventDate(event.startsAt, event.timezone),
    formatEventTime(event.startsAt, event.endsAt, event.timezone),
  ]
    .filter(Boolean)
    .join(", ");
  const description = when
    ? `Live group call: ${when}. Register free with Influencer Butler.`
    : "Live group call with Influencer Butler.";
  const url = `${SITE}/events/${event.id}`;
  const images = event.imageUrl ? [{ url: event.imageUrl }] : undefined;

  return {
    title: `${event.title} | Influencer Butler`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: event.title,
      description,
      url,
      type: "website",
      siteName: "Influencer Butler",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images: event.imageUrl ? [event.imageUrl] : undefined,
    },
  };
}

export default async function EventSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await loadShareableEvent(id);
  if (!event) notFound();

  const admin = getAdmin();
  const supabase = await createClient();
  const [siblings, { data: userData }] = await Promise.all([
    event.seriesId && admin ? listSeriesEvents(admin, event.seriesId) : Promise.resolve([]),
    supabase.auth.getUser(),
  ]);
  const signedIn = Boolean(userData.user?.email);

  // This occurrence plus every other time option for the same event, soonest
  // first, each with its own Register action tied to that specific occurrence.
  const timeOptions = event.seriesId
    ? siblings.length
      ? siblings
      : [event]
    : [event];

  const dateLine = formatEventDate(event.startsAt, event.timezone);
  const timeLine = formatEventTime(event.startsAt, event.endsAt, event.timezone);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {event.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.imageUrl}
              alt={`${event.title} event cover`}
              className="aspect-[1200/630] w-full object-cover"
            />
          ) : null}
          <div className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#c2410c]">
              Live event
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{event.title}</h1>
            {timeOptions.length === 1 && dateLine ? (
              <p className="mt-3 text-base font-medium text-slate-700">
                {dateLine}
                {timeLine ? `, ${timeLine}` : ""}
              </p>
            ) : null}
            {event.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{event.description}</p>
            ) : null}
            {timeOptions.length > 1 ? (
              <div className="mt-6 flex flex-col gap-3">
                <p className="text-sm font-semibold text-slate-700">Pick a time that works for you:</p>
                {timeOptions.map((opt) => {
                  const optDate = formatEventDate(opt.startsAt, opt.timezone);
                  const optTime = formatEventTime(opt.startsAt, opt.endsAt, opt.timezone);
                  return (
                    <div
                      key={opt.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-sm font-medium text-slate-700">
                        {optDate}
                        {optTime ? `, ${optTime}` : ""}
                      </p>
                      <RegisterButton
                        eventId={opt.id}
                        signedIn={signedIn}
                        label="Register for this time"
                        returnPath={`/events/${event.id}`}
                      />
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">
                  New here? Registering starts a free trial and joins you in.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <RegisterButton
                  eventId={event.id}
                  signedIn={signedIn}
                  label="Register for this event"
                  returnPath={`/events/${event.id}`}
                />
                <p className="mt-2 text-xs text-slate-500">
                  New here? Registering starts a free trial and joins you in.
                </p>
              </div>
            )}
            {event.recordEnabled ? (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {RECORDING_CONSENT_NOTICE}
              </p>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
