import EarningsToolClient from "./EarningsToolClient";
import { ToolHero, ToolCTA, RelatedTools } from "../_components/ToolShell";

const SLUG = "amazon-affiliate-earnings-calculator";

export const metadata = {
  title: "Amazon Affiliate Earnings Calculator (Free)",
  description:
    "Free Amazon affiliate earnings calculator. Estimate your monthly and yearly Amazon Associates commissions from clicks, conversion rate, average order value, and category.",
};

export default function EarningsCalculatorPage() {
  return (
    <>
      <ToolHero
        eyebrow="Free Tool"
        title="Amazon Affiliate Earnings"
        highlight="Calculator"
        subtitle="Plug in your traffic and see roughly what your Amazon links can earn. Adjust clicks, conversion rate, order value, and category to model your income."
      />

      <section className="mx-auto max-w-5xl px-6 py-12">
        <EarningsToolClient />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">How the estimate works</h2>
        <p className="mt-4 text-slate-600">
          The calculator multiplies your monthly clicks by your conversion rate to get orders, then
          by your average order value to get the sales you drive. It applies the Amazon Associates
          commission rate for the category you pick to estimate your commission.
        </p>
        <ul className="mt-4 space-y-2 text-slate-600">
          <li>
            <strong>Clicks:</strong> how many times people tap your affiliate links each month.
          </li>
          <li>
            <strong>Conversion rate:</strong> the share of those clicks that become a purchase.
          </li>
          <li>
            <strong>Average order value:</strong> the typical basket size on those orders. Remember
            Amazon pays commission on the whole qualifying cart, not just your linked product.
          </li>
          <li>
            <strong>Category:</strong> sets the commission rate, since Amazon pays different rates
            per category.
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          These are planning estimates, not a guarantee. Actual earnings depend on your cart mix,
          returns, and Amazon&apos;s current rate card.
        </p>
      </section>

      <RelatedTools currentSlug={SLUG} />
      <ToolCTA src={`tool-${SLUG}`} />
    </>
  );
}
