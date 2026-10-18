import { addSection, chip, el } from "../../ui/components";
import { getLocale } from "../../i18n";
import { GENERATIONS, inferShopperMix, recommendFormats } from "../../shared/shopper-generation";
import { SHOPPER_STRINGS } from "./strings";
import type { ProductSignals } from "../../amazon/product-signals";
import type { AudienceProfile } from "../../shared/audience-profile";

// The "Who buys this" section of the product panel: the generation most likely
// buying this listing (estimated from breadcrumb, title, price and review
// count; same rules as the desktop's Product Research), the estimated mix, and
// the content format + length that audience responds to most. Read straight
// off the page, no network call. When the paired app has an audience profile
// (cached by the background), the estimate leans toward it exactly like
// Product Research does, and a "Tuned to your audience" note says so. Renders
// nothing on a rough guess (no category or title signal) so the panel never
// shows noise.
export function renderShopperGeneration(
  signals: ProductSignals,
  audienceProfile?: AudienceProfile | null,
): HTMLElement | null {
  const est = inferShopperMix(
    {
      categoryPath: signals.categoryPath,
      category: signals.category,
      title: signals.title,
      priceCents: signals.priceCents,
      reviewCount: signals.reviewCount ?? null,
    },
    audienceProfile ?? null,
  );
  if (est.confidence === "low") return null;
  const best = recommendFormats(est.mix)[0];
  if (!best) return null;

  const s = SHOPPER_STRINGS[getLocale() as keyof typeof SHOPPER_STRINGS] ?? SHOPPER_STRINGS.en;
  const section = addSection(s.title, s.info);

  const chips = el("div", "counts");
  chips.append(chip("influencer", s.gen[est.primary]), chip("muted", s.confidence[est.confidence]));
  section.append(chips);

  const mix = GENERATIONS.map((g) => `${s.gen[g]} ${Math.round(est.mix[g] * 100)}%`).join(", ");
  section.append(el("p", "note", mix));

  const platforms = best.platforms.map((p) => s.platform[p] ?? p).join(", ");
  section.append(el("p", "note", s.makeThis(s.format[best.id], best.length, platforms)));
  section.append(el("p", "note", s.why[est.primary]));
  if (est.reasons.includes("creatorAudience")) section.append(el("p", "note", s.tuned));
  return section;
}
