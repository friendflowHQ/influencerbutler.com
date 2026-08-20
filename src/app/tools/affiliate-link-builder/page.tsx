import LinkBuilderClient from "./LinkBuilderClient";
import { ToolHero, ToolCTA, RelatedTools } from "../_components/ToolShell";

const SLUG = "affiliate-link-builder";

export const metadata = {
  title: "Affiliate Link Builder with UTM Tags (Free)",
  description:
    "Free affiliate and storefront link builder. Add clean channel tags and UTM parameters to your Amazon storefront links so you can see which channels convert.",
};

export default function LinkBuilderPage() {
  return (
    <>
      <ToolHero
        eyebrow="Free Tool"
        title="Affiliate Link"
        highlight="Builder"
        subtitle="Add clean channel and campaign tags to any link. Paste your Amazon storefront or product URL, pick where you are sharing it, and get a trackable link in one click."
      />

      <section className="mx-auto max-w-5xl px-6 py-12">
        <LinkBuilderClient />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Why tag your links?
        </h2>
        <p className="mt-4 text-slate-600">
          If you share the same storefront link everywhere, you cannot tell whether your sales come
          from Instagram, TikTok, your email list, or your blog. Adding UTM tags labels each link so
          your analytics can break down clicks by channel and campaign. That tells you where to
          spend your time.
        </p>
        <ul className="mt-4 space-y-2 text-slate-600">
          <li>
            <strong>utm_source:</strong> the channel you picked (instagram, tiktok, and so on).
          </li>
          <li>
            <strong>utm_medium:</strong> the type of channel (social, email, or referral).
          </li>
          <li>
            <strong>utm_campaign:</strong> your optional campaign name, so you can compare specific
            posts or promos.
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          This tags your own links for your own analytics. It is separate from the Influencer Butler
          affiliate program, which uses its own referral links.
        </p>

        <h2 className="mt-8 text-2xl font-bold tracking-tight text-slate-900">
          Want branded short links with click tracking?
        </h2>
        <p className="mt-4 text-slate-600">
          Switch the link type to <strong>Influencer Butler DeepLink</strong> above to preview branded{" "}
          <strong>links.influencerbutler.com</strong> links. Inside the app you pick Influencer Butler as
          your provider under DeepLink Routing, and every link your tools build becomes a short branded
          link you own, with a Link Performance dashboard showing real clicks by day, country, and
          device. Your affiliate tag is preserved, and it is free on every plan.
        </p>
      </section>

      <RelatedTools currentSlug={SLUG} />
      <ToolCTA src={`tool-${SLUG}`} />
    </>
  );
}
