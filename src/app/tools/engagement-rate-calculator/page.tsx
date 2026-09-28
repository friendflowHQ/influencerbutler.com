import EngagementRateClient from "./EngagementRateClient";
import { ToolHero, ToolCTA, RelatedTools } from "../_components/ToolShell";

const SLUG = "engagement-rate-calculator";

export const metadata = {
  title: "Engagement Rate Calculator for Instagram, TikTok & YouTube (Free)",
  description:
    "Free engagement rate calculator. Enter your followers, average likes, and comments to get your engagement rate and see how it compares to platform benchmarks.",
};

export default function EngagementRatePage() {
  return (
    <>
      <ToolHero
        eyebrow="Free Tool"
        title="Engagement Rate"
        highlight="Calculator"
        subtitle="Find your real engagement rate and see how it stacks up on Instagram, TikTok, and YouTube. A must-have number for pitching brands and knowing your worth."
      />

      <section className="mx-auto max-w-5xl px-6 py-12">
        <EngagementRateClient />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Why engagement rate matters
        </h2>
        <p className="mt-4 text-slate-600">
          Brands care more about engagement than follower count. A creator with 8,000 highly engaged
          followers often drives more sales than one with 80,000 passive ones. Your engagement rate
          is the quickest proof that your audience actually listens to you.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-slate-900">How it is calculated</h3>
        <p className="mt-2 text-slate-600">
          This tool uses the standard formula: (average likes + average comments) divided by your
          follower count, times 100. Enter numbers from your typical recent posts rather than a
          single viral one for a rate that reflects your normal performance.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Benchmarks differ by platform: TikTok rates run much higher than Instagram or YouTube, so
          the tool grades your rate against the right platform.
        </p>
      </section>

      <RelatedTools currentSlug={SLUG} />
      <ToolCTA src={`tool-${SLUG}`} />
    </>
  );
}
