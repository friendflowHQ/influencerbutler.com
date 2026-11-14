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
import { publicOpportunities } from "@/lib/foyer-invites";
import { CopyCaptionButton } from "./ClaimPanel";

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
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={p.postUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            View your post
          </a>
          {p.caption ? <CopyCaptionButton caption={p.caption} /> : null}
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
        <a href={p.postUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          View your post
        </a>
      </div>
    </li>
  );
}

export default function OpportunitiesView({ op, claimed }: { op: InviteOpportunities; claimed: boolean }) {
  const { dealPosts, campaignPosts, lockedCampaigns } = publicOpportunities(op, claimed);
  return (
    <div className="mt-6 space-y-8">
      {dealPosts.length ? (
        <section aria-label="Your posts on sale today">
          <h2 className="text-xl font-bold text-slate-900">On sale today</h2>
          <p className="mt-1 text-slate-700">
            Products you already posted are on sale right now: a good reason to share them again. Each one has a caption
            ready to copy, linking to your own post.
          </p>
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
            already posted. Influencer Butler can accept them for you.
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
