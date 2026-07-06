import { addSection, chip, collapsible, el } from "../../ui/components";
import { t } from "../../i18n";
import type { CarouselResult } from "../../amazon/video-carousel";

// The headline tool: who owns this product's video carousel?
export function renderVideoCounts(result: CarouselResult): void {
  const section = addSection(t().videoCompetition);

  if (result.counts.total === 0) {
    // No upper carousel at all vs a carousel that exists but is empty are very
    // different signals: the first means a video here will not surface on the
    // listing, the second is a wide-open opportunity. Make each a clear seal.
    const callout = el(
      "div",
      result.strategy === "none" ? "seal warn" : "seal pass",
    );
    callout.textContent = result.strategy === "none" ? t().noCarousel : t().noVideosYet;
    section.append(callout);
    return;
  }

  if (result.strategy === "header") {
    const pending = el("p", "note");
    pending.textContent = t().videosPending(result.counts.total);
    section.append(pending);
    return;
  }

  const counts = el("div", "counts");
  counts.append(
    chip("influencer", t().chipInfluencer(result.counts.influencer)),
    chip("brand", t().chipBrand(result.counts.brand)),
    chip("customer", t().chipCustomer(result.counts.customer)),
  );
  if (result.counts.unknown > 0) {
    counts.append(chip("", t().chipUnclassified(result.counts.unknown)));
  }
  section.append(counts);

  const summary = el("p", "note");
  summary.textContent = t().videosTotalVia(result.counts.total, result.strategy === "json");
  section.append(summary);

  const influencers = result.videos.filter(
    (v) => v.creatorType === "influencer" && (v.creatorName || v.title),
  );
  if (influencers.length > 0) {
    const shown = influencers.slice(0, 6);
    const content = collapsible(section, t().influencerVideosLabel(shown.length), {
      open: true,
    });
    const list = el("ul", "list");
    for (const video of shown) {
      const item = el("li");
      item.append(el("span", "t", video.creatorName ?? t().influencerFallback));
      if (video.title) {
        const title = el("span", "", video.title.slice(0, 70));
        item.append(title);
      }
      list.append(item);
    }
    content.append(list);
  }
}
