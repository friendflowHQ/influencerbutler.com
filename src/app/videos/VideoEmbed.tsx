import type { CatalogVideo, VideoTranscript } from "@/lib/video-catalog";
import { embedUrl } from "@/lib/video-catalog";

// One lazy, privacy-mode embed plus its collapsed transcript (WCAG 1.2 text
// alternative). Same markup the static pages get from
// scripts/inject-feature-videos.mjs, styled with Tailwind here.
export default function VideoEmbed({
  video,
  transcript,
  className = "",
}: {
  video: CatalogVideo;
  transcript?: VideoTranscript;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl bg-slate-900 shadow-lg">
        <iframe
          src={embedUrl(video.videoId)}
          title={`Video: ${video.title}`}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="block aspect-video w-full border-0"
        />
      </div>
      {transcript && transcript.paragraphs.length > 0 ? (
        <details
          className="mt-4 rounded-lg border border-slate-200 bg-slate-50 text-left"
          lang={transcript.language || "en"}
        >
          <summary className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]">
            Read the video transcript
          </summary>
          <div className="px-4 pb-4 text-sm leading-relaxed text-slate-600">
            {transcript.paragraphs.map((p, i) => (
              <p key={i} className="mt-2">
                {p.heading ? <strong className="text-slate-800">{p.heading.trim()}. </strong> : null}
                {p.text}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
