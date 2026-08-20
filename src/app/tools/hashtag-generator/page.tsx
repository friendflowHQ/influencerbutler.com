import HashtagGeneratorClient from "./HashtagGeneratorClient";
import { ToolHero, ToolCTA, RelatedTools } from "../_components/ToolShell";

const SLUG = "hashtag-generator";

export const metadata = {
  title: "Hashtag Generator for Amazon Influencers (Free)",
  description:
    "Free hashtag generator for Amazon influencers and affiliates. Enter a product or niche and get a ready-to-paste mix of broad, niche, and shopping hashtags.",
};

export default function HashtagGeneratorPage() {
  return (
    <>
      <ToolHero
        eyebrow="Free Tool"
        title="Hashtag"
        highlight="Generator"
        subtitle="Enter a product or niche and get a ready-to-paste set of hashtags built for Amazon-influencer reach: broad tags, niche tags, and shopping-intent tags."
      />

      <section className="mx-auto max-w-5xl px-6 py-12">
        <HashtagGeneratorClient />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          How to use these hashtags
        </h2>
        <p className="mt-4 text-slate-600">
          The best-performing hashtag sets mix three kinds of tags: a few broad ones for reach, a
          batch of niche ones so the right people find you, and shopping tags like #amazonfinds that
          signal buying intent. This generator blends all three automatically.
        </p>
        <ul className="mt-4 space-y-2 text-slate-600">
          <li>
            <strong>Pick your niche:</strong> type a keyword or tap a suggestion chip.
          </li>
          <li>
            <strong>Choose how many:</strong> most creators use 10 to 30 per post.
          </li>
          <li>
            <strong>Copy and tailor:</strong> paste them in, then swap a few for tags specific to
            your exact product.
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Hashtags help, but consistency and good content matter more. Rotate your sets so your
          posts do not look identical to the algorithm.
        </p>
      </section>

      <RelatedTools currentSlug={SLUG} />
      <ToolCTA src={`tool-${SLUG}`} />
    </>
  );
}
