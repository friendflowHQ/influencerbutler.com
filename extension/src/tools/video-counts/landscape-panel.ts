import { collapsible, el } from "../../ui/components";
import { t } from "../../i18n";
import type { VideoLandscape } from "../../amazon/video-landscape";
import type { CarouselVideo } from "../../amazon/video-carousel";

// Renders the aggregate "Video landscape" inside the video competition section.
// Everything drawn here comes from a single page-load snapshot; date- and
// duration-based blocks appear only when the source fields were actually
// present (landscape.hasDates / hasDurations), otherwise an honest note
// explains the absence rather than showing an empty chart or a fake zero.
//
// The host is cleared and rebuilt on each call, so Deep Scan can hand the fuller
// harvested video set back in and the panel simply refreshes.
export function renderLandscape(host: HTMLElement, landscape: VideoLandscape): void {
  host.replaceChildren();
  const content = collapsible(host, t().videoLandscape, { open: true });

  content.append(
    tiles([
      [String(landscape.known), t().lsStatKnown],
      [String(landscape.currentlyPlaced), t().lsStatPlaced],
      [String(landscape.uniqueCreators), t().lsStatCreators],
      [String(landscape.effective.repeat), t().lsStatRepeat],
    ]),
  );

  if (landscape.currentlyPlaced > 0) {
    content.append(el("p", "ls-sublabel", t().lsContentMixLabel));
    content.append(mixBar(landscape.contentMix, landscape.currentlyPlaced));
  }

  if (landscape.concentration.length > 0) {
    content.append(el("p", "ls-sublabel", t().lsConcentrationLabel));
    content.append(concentrationBars(landscape.concentration));
    content.append(
      el("p", "note", t().lsConcentrationShare(Math.round(landscape.top5Share * 100))),
    );
  }

  if (landscape.topByStrength.length > 0) {
    const list = collapsible(content, t().lsTopStrengthLabel, { open: false });
    list.append(strengthList(landscape.topByStrength));
  }

  renderDates(content, landscape);
  renderDurations(content, landscape);
}

function tiles(rows: Array<[string, string]>): HTMLElement {
  const wrap = el("div", "ls-tiles");
  for (const [value, label] of rows) {
    const tile = el("div", "ls-tile");
    tile.append(el("div", "ls-val", value), el("div", "ls-lab", label));
    wrap.append(tile);
  }
  return wrap;
}

function mixBar(
  mix: { influencer: number; brand: number; customer: number; unknown: number },
  total: number,
): HTMLElement {
  const bar = el("div", "ls-mix");
  const order: Array<keyof typeof mix> = ["influencer", "brand", "customer", "unknown"];
  for (const kind of order) {
    const count = mix[kind];
    if (count <= 0) continue;
    const seg = el("div", `ls-mix-seg ${kind}`);
    seg.style.width = `${(count / total) * 100}%`;
    seg.title = `${kind}: ${count}`;
    bar.append(seg);
  }
  return bar;
}

function concentrationBars(creators: VideoLandscape["concentration"]): HTMLElement {
  const wrap = el("div", "ls-conc");
  for (const c of creators) {
    const row = el("div", "ls-conc-row");
    const name = el("span", "ls-conc-name", c.name);
    name.title = c.name;
    const track = el("div", "ls-conc-track");
    const fill = el("div", "ls-conc-fill");
    fill.style.width = `${Math.max(6, c.share * 100)}%`;
    track.append(fill);
    row.append(name, track, el("span", "ls-conc-count", String(c.count)));
    wrap.append(row);
  }
  return wrap;
}

function strengthList(videos: CarouselVideo[]): HTMLElement {
  const list = el("ul", "list");
  for (const v of videos) {
    const li = el("li");
    const head = el("div", "ls-card-head");
    head.append(el("span", "t", v.creatorName ?? t().influencerFallback));
    if (v.carousel === "upper" || v.carousel === "lower") {
      head.append(
        el("span", `ls-badge ${v.carousel}`, v.carousel === "upper" ? t().lsUpper : t().lsLower),
      );
    }
    li.append(head);
    if (v.title) li.append(el("span", "", v.title.slice(0, 70)));
    list.append(li);
  }
  return list;
}

function renderDates(content: HTMLElement, landscape: VideoLandscape): void {
  if (!landscape.hasDates || !landscape.pulse) {
    content.append(el("p", "note", t().lsDatesUnavailable));
    return;
  }
  content.append(
    el("p", "ls-sublabel", t().lsPulseLabel(landscape.datedCount ?? 0, landscape.currentlyPlaced)),
  );
  content.append(pulseBars(landscape.pulse));
  if (typeof landscape.newIn30 === "number") {
    content.append(el("p", "note", t().lsNewIn30(landscape.newIn30)));
  }
}

function pulseBars(pulse: number[]): HTMLElement {
  const wrap = el("div", "ls-pulse");
  const max = Math.max(1, ...pulse);
  for (const count of pulse) {
    const bar = el("div", "ls-pulse-bar");
    bar.style.height = `${(count / max) * 100}%`;
    bar.title = String(count);
    wrap.append(bar);
  }
  return wrap;
}

function renderDurations(content: HTMLElement, landscape: VideoLandscape): void {
  if (!landscape.hasDurations || typeof landscape.medianSec !== "number") {
    content.append(el("p", "note", t().lsDurationsUnavailable));
    return;
  }
  content.append(el("p", "ls-sublabel", t().lsTypicalLengthLabel));
  const median = formatDuration(landscape.medianSec);
  const text = landscape.bandSec
    ? t().lsLengthBand(median, formatDuration(landscape.bandSec[0]), formatDuration(landscape.bandSec[1]))
    : t().lsLengthMedian(median);
  content.append(el("p", "note", text));
}

// Seconds to m:ss (or h:mm:ss for the rare long video).
function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
