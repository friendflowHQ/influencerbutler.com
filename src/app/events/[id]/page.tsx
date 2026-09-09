/**
 * Public share page for a group event: /events/<id>. Shows the branded cover
 * image, title, date, time, and description with a "Register" call to action
 * into the dashboard. Its whole reason to exist is a real og:image / Twitter
 * card so pasting the link into social or chat unfurls the branded image (the
 * dashboard events page is auth-gated, so scrapers can never see it there).
 */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import { getAdmin, getEvent, type EventRow } from "@/lib/events";
import { formatEventDate, formatEventTime } from "@/lib/event-image-text";

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

  const dateLine = formatEventDate(event.startsAt, event.timezone);
  const timeLine = formatEventTime(event.startsAt, event.endsAt, event.timezone);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
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
            {dateLine ? (
              <p className="mt-3 text-base font-medium text-slate-700">
                {dateLine}
                {timeLine ? `, ${timeLine}` : ""}
              </p>
            ) : null}
            {event.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{event.description}</p>
            ) : null}
            <div className="mt-6">
              <Link
                href="/dashboard/events"
                className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c]"
              >
                Register for this event
              </Link>
              <p className="mt-2 text-xs text-slate-500">
                Registration opens in your dashboard. New here? You can start a free trial and join.
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
