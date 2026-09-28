import { butlerTier } from "@/lib/entitlements";

/**
 * Small pill that labels something as Free forever vs Pro. The single reusable
 * primitive for tier labeling across the site, so "what is free" reads the same
 * everywhere and always derives from the entitlements source of truth
 * (src/lib/entitlements.ts butlerTier / FREE_BUTLER_SLUGS).
 *
 * Pass a butler `slug` to derive the tier, or a literal `tier` when labeling a
 * whole plan/section rather than one butler.
 */
type TierBadgeProps = { className?: string } & (
  | { tier: "free" | "pro"; slug?: never }
  | { slug: string; tier?: never }
);

export function TierBadge({ tier, slug, className = "" }: TierBadgeProps) {
  const resolved = tier ?? butlerTier(slug as string);
  const isFree = resolved === "free";
  const label = isFree ? "Free forever" : "Pro";
  const styles = isFree
    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
    : "bg-slate-100 text-slate-700 ring-1 ring-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
