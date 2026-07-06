import type { CarouselVideo } from "../../amazon/video-carousel";

// Export helpers for the Deep Scan harvest. buildVideoCsv is pure so it is unit
// testable; the human-readable "copy summary" text is assembled in the panel
// where the locale (t()) lives. downloadCsv mirrors storefront-check/csv.ts: a
// blob URL click, so no downloads permission is needed.

function esc(value: string): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildVideoCsv(videos: CarouselVideo[]): string {
  const rows: string[] = ["carousel,creator_type,creator_name,title,url"];
  for (const v of videos) {
    rows.push(
      [v.carousel, v.creatorType, esc(v.creatorName ?? ""), esc(v.title ?? ""), esc(v.url ?? "")].join(
        ",",
      ),
    );
  }
  return rows.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
