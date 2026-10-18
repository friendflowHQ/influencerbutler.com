import Link from "next/link";
import { findVideo, loadVideoCatalog, loadVideoTranscripts } from "@/lib/video-catalog";
import VideoEmbed from "@/app/videos/VideoEmbed";

// The "Plans: Beginner vs Power User" walkthrough, placed under the pricing
// cards. Server component; renders nothing if the catalog has no such video so
// the page never shows an empty frame. No JSON-LD here: /pricing is noindex.
export default async function PlansVideo() {
  const catalog = await loadVideoCatalog();
  const video = findVideo(catalog, "plans-beginner-vs-power");
  if (!video) return null;
  const transcripts = await loadVideoTranscripts();
  return (
    <section aria-labelledby="plans-video-title" className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#c2410c]">Not sure which plan?</p>
        <h2 id="plans-video-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Beginner or Power User, in two minutes
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
          A short screen recording of what each plan shows inside the app, and how to switch later.
        </p>
      </div>
      <VideoEmbed video={video} transcript={transcripts[video.videoId]} className="mt-8" />
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href={`/videos/${video.slug}`} className="font-semibold text-[#c2410c]">
          Open on the videos page
        </Link>
      </p>
    </section>
  );
}
