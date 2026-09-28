import { el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type VideoIntelResult } from "../../shared/messages";
import { deriveVideoId } from "../../amazon/video-identity";
import type { CarouselVideo } from "../../amazon/video-carousel";

// The per-video "passport": longitudinal placement history for one creator
// video, read from the shared pool. Everything here is inherently a time series,
// so until enough distinct days have accrued (collecting=true) the rate/rotation
// metrics are withheld by the server and we show an honest "collecting" state.
// A day with no observation is drawn as a hatched gap, never as "absent".

export function renderVideoPassport(host: HTMLElement, video: CarouselVideo, marketplace: string): void {
  host.replaceChildren();
  const videoId = deriveVideoId(video);
  if (!videoId) {
    host.append(el("p", "note", t().passportUnidentified));
    return;
  }

  const loading = el("p", "note", t().passportLoading);
  host.append(loading);

  void sendToBackground<VideoIntelResult>({ kind: "GET_VIDEO_INTEL", videoId, marketplace })
    .then((res) => renderResult(host, res))
    .catch(() => {
      host.replaceChildren(el("p", "note", t().passportUnavailable));
    });
}

function renderResult(host: HTMLElement, res: VideoIntelResult): void {
  host.replaceChildren();
  if (res.migrationPending || !res.ok) {
    host.append(el("p", "note", t().passportUnavailable));
    return;
  }
  if (res.activeDays === 0) {
    host.append(el("p", "note", t().passportNoData));
    return;
  }

  const body = el("div", "pp-body");

  if (res.collecting) {
    const since = res.firstSeen ? ` ${t().passportSinceFirstSeen(formatDate(res.firstSeen))}` : "";
    body.append(el("p", "note", `${t().passportCollecting(res.daysTracked)}${since}`));
  } else {
    body.append(metrics(res));
  }

  // Always-honest known facts, shown in both states.
  const known = el("div", "pp-metrics");
  known.append(metric(String(res.productReach), t().passportReach));
  known.append(metric(String(res.activeDays), t().passportActiveDays));
  body.append(known);

  if (res.upperShare !== null && res.lowerShare !== null) {
    body.append(
      el(
        "p",
        "note",
        t().passportUpperLower(Math.round(res.upperShare * 100), Math.round(res.lowerShare * 100)),
      ),
    );
  }

  if (res.series.length > 0) body.append(strip(res.series));

  if (res.snapshot.length > 0) {
    body.append(el("p", "ls-sublabel", t().passportCurrentSnapshot));
    body.append(snapshotRows(res.snapshot));
  }
  if (res.lastObserved) {
    body.append(el("p", "note", t().passportLastObserved(formatDate(res.lastObserved))));
  }

  host.append(body);
}

function metrics(res: VideoIntelResult): HTMLElement {
  const wrap = el("div", "pp-metrics");
  wrap.append(metric(pct(res.presenceRate), t().passportPresence));
  wrap.append(metric(pct(res.stability), t().passportStability));
  wrap.append(
    metric(
      res.activeDayStrength !== null ? res.activeDayStrength.toFixed(1) : "-",
      t().passportStrength,
    ),
  );
  return wrap;
}

function metric(value: string, label: string): HTMLElement {
  const tile = el("div", "pp-metric");
  tile.append(el("div", "pp-val", value), el("div", "pp-lab", label));
  return tile;
}

function strip(series: VideoIntelResult["series"]): HTMLElement {
  const wrap = el("div", "pp-strip");
  const max = Math.max(1, ...series.map((d) => d.asinCount));
  for (const day of series) {
    const bar = el("div", `pp-day ${day.status === "visible" ? "visible" : "nodata"}`);
    if (day.status === "visible") bar.style.height = `${Math.max(12, (day.asinCount / max) * 100)}%`;
    bar.title = day.status === "visible" ? `${day.day}: ${day.asinCount}` : `${day.day}: ${t().passportNoDataDay}`;
    wrap.append(bar);
  }
  return wrap;
}

function snapshotRows(snapshot: VideoIntelResult["snapshot"]): HTMLElement {
  const wrap = el("div", "pp-snap");
  for (const s of snapshot.slice(0, 12)) {
    const row = el("div", "pp-snap-row");
    row.append(el("span", "pp-asin", s.asin));
    const place =
      s.position !== null
        ? `${labelCarousel(s.carousel)} #${s.position}`
        : labelCarousel(s.carousel);
    row.append(el("span", "", place));
    wrap.append(row);
  }
  return wrap;
}

function labelCarousel(carousel: string): string {
  if (carousel === "upper") return t().lsUpper;
  if (carousel === "lower") return t().lsLower;
  return "-";
}

function pct(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
