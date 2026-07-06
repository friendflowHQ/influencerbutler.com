import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import type { CarouselResult } from "../../amazon/video-carousel";

// The headline tool: who owns this product's video carousel?
export function renderVideoCounts(result: CarouselResult): void {
  const section = addSection(t().videoCompetition);

  if (result.counts.total === 0) {
    const empty = el("p", "note");
    empty.textContent =
      result.strategy === "none" ? t().noCarousel : t().noVideosYet;
    section.append(empty);
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
    const list = el("ul", "list");
    for (const video of influencers.slice(0, 6)) {
      const item = el("li");
      item.append(el("span", "t", video.creatorName ?? t().influencerFallback));
      if (video.title) {
        const title = el("span", "", video.title.slice(0, 70));
        item.append(title);
      }
      list.append(item);
    }
    section.append(list);
  }
}
