/**
 * The v3 body of a private invite page: the creator's OWN storefront posts that
 * can earn more today. Every on-sale post shows (thumbnail, % off, an estimated
 * commission per sale, a link to their own post and a ready caption to copy).
 * Posts with an open Creator Connections campaign are labelled for Gold and
 * Platinum creators (the program is tier-gated and a tier is not public); the
 * first few show, the rest unlock on claim. Estimates only, never totals or
 * "money you lost" framing.
 */
import type { InviteOpportunities, OpportunityPost } from "@/lib/foyer-invites";
import { campaignConnectUrl, publicOpportunities } from "@/lib/foyer-invites";
import { CopyCaptionButton, TrackingIdBox } from "./ClaimPanel";

/** Opens the campaign on Amazon's own Creator Connections page, where they click Accept. */
function OpenCampaignButton({ p }: { p: OpportunityPost }) {
  const href = campaignConnectUrl(p);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
      title="Opens the campaign in Creator Connections. Sign in to your Amazon Associates account, then click Accept."
    >
      Open campaign in Creator Connections
    </a>
  );
}

function perSale(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `about $${v.toFixed(2)} per sale` : "";
}

function Thumb({ p }: { p: OpportunityPost }) {
  return p.thumbUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.thumbUrl} alt="" loading="lazy" className="h-28 w-28 flex-none rounded-xl object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div className="h-28 w-28 flex-none rounded-xl bg-orange-100" aria-hidden="true" />
  );
}

export function DealCard({ p }: { p: OpportunityPost }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <Thumb p={p} />
      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
          {p.deal?.percentOff}% off right now
        </span>
        <h3 className="mt-1 font-semibold text-slate-900">{p.title}</h3>
        <p className="text-sm text-slate-600">
          {perSale(p.perSale.base)}
          {p.deal?.endsDisplay ? ` · sale ends ${p.deal.endsDisplay.split(" ")[0]}` : ""}
        </p>
        {p.campaign ? (
          <p className="mt-1 text-sm text-slate-700">
            Also in a {p.campaign.brand ? `${p.campaign.brand} ` : ""}campaign: {p.campaign.ratePct}% commission
            {p.perSale.campaign != null ? `, ${perSale(p.perSale.campaign)}` : ""}
            <span className="ml-1 text-xs text-amber-900">(Gold and Platinum creators)</span>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={p.postUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            View your post
          </a>
          {p.caption ? <CopyCaptionButton caption={p.caption} asin={p.asin} /> : null}
          {p.campaign ? <OpenCampaignButton p={p} /> : null}
        </div>
      </div>
    </li>
  );
}

export function CampaignCard({ p }: { p: OpportunityPost }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <Thumb p={p} />
      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
          Gold and Platinum creators
        </span>
        <h3 className="mt-1 font-semibold text-slate-900">{p.title}</h3>
        <p className="text-sm text-slate-700">
          {p.campaign?.brand ? `${p.campaign.brand} ` : ""}campaign: {p.campaign?.ratePct}% commission
          {p.perSale.campaign != null ? `, ${perSale(p.perSale.campaign)}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={p.postUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            View your post
          </a>
          <OpenCampaignButton p={p} />
        </div>
      </div>
    </li>
  );
}

/** One of their posts in a shopping event: live now, or the day the sale starts. */
export function EventCard({ p, label }: { p: OpportunityPost; label: string }) {
  const when = p.deal?.live || !p.deal?.startsDay ? "on sale now" : `starts ${p.deal.startsDay}`;
  return (
    <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <Thumb p={p} />
      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
          {label}: {p.deal?.percentOff}% off, {when}
        </span>
        <h3 className="mt-1 font-semibold text-slate-900">{p.title}</h3>
        <p className="text-sm text-slate-600">
          {perSale(p.perSale.base)}
          {p.deal?.endsDay && p.deal.endsDay !== p.deal.startsDay ? ` · through ${p.deal.endsDay}` : ""}
        </p>
        {p.campaign ? (
          <p className="mt-1 text-sm text-slate-700">
            Also in a {p.campaign.brand ? `${p.campaign.brand} ` : ""}campaign: {p.campaign.ratePct}% commission
            {p.perSale.campaign != null ? `, ${perSale(p.perSale.campaign)}` : ""}
            <span className="ml-1 text-xs text-amber-900">(Gold and Platinum creators)</span>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={p.postUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            View your post
          </a>
          {p.caption ? <CopyCaptionButton caption={p.caption} asin={p.asin} /> : null}
          {p.campaign ? <OpenCampaignButton p={p} /> : null}
        </div>
      </div>
    </li>
  );
}

export default function OpportunitiesView({ op, claimed }: { op: InviteOpportunities; claimed: boolean }) {
  const { event, eventPosts, dealPosts, campaignPosts, lockedCampaigns } = publicOpportunities(op, claimed);
  const more = event ? event.count - eventPosts.length : 0;
  return (
    <div className="mt-6 space-y-8">
      {event && eventPosts.length ? (
        <section aria-label={`Your posts with ${event.label} deals`}>
          <h2 className="text-xl font-bold text-slate-900">{event.label} on your posts</h2>
          <p className="mt-1 text-slate-700">
            {event.count === 1 ? "One of your posts has" : `${event.count} of your posts have`} a {event.label} deal
            {event.live > 0 ? `, ${event.live} on sale already` : ""}. Share them again when the sale starts: each one has
            a caption ready to copy.
          </p>
          <TrackingIdBox />
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {eventPosts.map((p) => (
              <EventCard key={p.asin} p={p} label={event.label} />
            ))}
          </ul>
          {more > 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              These are the {eventPosts.length} that earn the most per sale, out of {event.count}.
            </p>
          ) : null}
        </section>
      ) : null}

      {dealPosts.length ? (
        <section aria-label="Your posts on sale today">
          <h2 className="text-xl font-bold text-slate-900">On sale today</h2>
          <p className="mt-1 text-slate-700">
            Products you already posted are on sale right now: a good reason to share them again. Each one has a caption
            ready to copy.
          </p>
          {eventPosts.length ? null : <TrackingIdBox />}
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {dealPosts.map((p) => (
              <DealCard key={p.asin} p={p} />
            ))}
          </ul>
        </section>
      ) : null}

      {campaignPosts.length ? (
        <section aria-label="Open campaigns on your posts">
          <h2 className="text-xl font-bold text-slate-900">Open campaigns on your posts</h2>
          <p className="mt-1 text-slate-700">
            If you are a Gold or Platinum creator, brands are running Creator Connections campaigns on products you
            already posted. Tap Open campaign to see it in Creator Connections and accept it yourself, or let
            Influencer Butler accept them for you.
          </p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {campaignPosts.map((p) => (
              <CampaignCard key={p.asin} p={p} />
            ))}
          </ul>
          {lockedCampaigns > 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              {lockedCampaigns} more campaign post{lockedCampaigns === 1 ? "" : "s"} unlock when you claim your page.
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-slate-500">
        Commission figures are estimates from current sale prices and Amazon&apos;s published category rates. Sales and
        campaigns change daily.
      </p>
    </div>
  );
}
