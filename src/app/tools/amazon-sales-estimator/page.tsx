import SalesEstimatorClient from "./SalesEstimatorClient";
import { ToolHero, ToolCTA, RelatedTools } from "../_components/ToolShell";

const SLUG = "amazon-sales-estimator";

export const metadata = {
  title: "Amazon Sales Estimator: BSR to Monthly Sales (Free)",
  description:
    "Free Amazon sales estimator. Enter a product's Best Sellers Rank (BSR) and category to estimate how many units it sells per month and per day.",
};

export default function SalesEstimatorPage() {
  return (
    <>
      <ToolHero
        eyebrow="Free Tool"
        title="Amazon Sales"
        highlight="Estimator"
        subtitle="Enter any product's Best Sellers Rank and category to estimate how many units it moves each month. Great for sizing up demand before you feature a product."
      />

      <section className="mx-auto max-w-5xl px-6 py-12">
        <SalesEstimatorClient />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          What is Best Sellers Rank?
        </h2>
        <p className="mt-4 text-slate-600">
          Best Sellers Rank (BSR) is Amazon&apos;s measure of how well a product sells within its
          category, updated hourly. A rank of #1 is the top seller; higher numbers sell less. Amazon
          no longer publishes unit counts, so estimators fit a curve that maps rank to sales per
          category.
        </p>
        <p className="mt-4 text-slate-600">
          Because a #5,000 rank in Home &amp; Kitchen sells very differently from #5,000 in
          Electronics, always match the category. Use the estimate to compare products and spot
          demand, not as an exact sales figure.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Want live rank and sales estimates right on the Amazon page while you browse? That is what
          the Influencer Butler Chrome extension and desktop app do automatically.
        </p>
      </section>

      <RelatedTools currentSlug={SLUG} />
      <ToolCTA
        src={`tool-${SLUG}`}
        heading="See sales estimates while you shop."
        body="The free Influencer Butler extension shows rank, sales estimates, and commission math right on Amazon listings. Install it in one click."
      />
    </>
  );
}
