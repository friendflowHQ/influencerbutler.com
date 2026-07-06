import { downloadCsv } from "../storefront-check/csv";

// CSV of the content gaps found across order-history batches. Reuses the
// storefront tool's blob-download helper (no downloads permission needed).

export type GapRow = {
  asin: string;
  title: string;
  url: string;
  reason: string;
  influencerVideos: number;
  totalVideos: number;
  noCarousel: boolean;
  hasCc: boolean;
};

function esc(value: string): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildGapCsv(rows: GapRow[]): string {
  const out: string[] = [
    "asin,title,url,reason,influencer_videos,total_videos,no_upper_carousel,cc_campaign",
  ];
  for (const r of rows) {
    out.push(
      [
        r.asin,
        esc(r.title),
        esc(r.url),
        esc(r.reason),
        String(r.influencerVideos),
        String(r.totalVideos),
        r.noCarousel ? "yes" : "no",
        r.hasCc ? "yes" : "no",
      ].join(","),
    );
  }
  return out.join("\n");
}

export { downloadCsv };
