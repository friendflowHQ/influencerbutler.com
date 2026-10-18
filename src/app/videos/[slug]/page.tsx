import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  SITE_ORIGIN,
  findVideo,
  formatDuration,
  loadVideoCatalog,
  loadVideoTranscripts,
  videoObject,
  videoPageUrl,
  watchUrl,
} from "@/lib/video-catalog";
import VideoEmbed from "../VideoEmbed";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  const catalog = await loadVideoCatalog();
  return catalog.videos.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await loadVideoCatalog();
  const video = findVideo(catalog, slug);
  if (!video) return { title: "Video not found" };
  const url = videoPageUrl(video);
  return {
    title: `${video.title} | Influencer Butler walkthrough`,
    description: video.description || `${video.title}: a short narrated screen recording of Influencer Butler.`,
    alternates: { canonical: url },
    openGraph: {
      title: video.title,
      description: video.description || video.title,
      url,
      type: "video.other",
      images: [{ url: video.thumbnailUrl, width: 480, height: 360 }],
      videos: [{ url: video.embedUrl, width: 1280, height: 720 }],
    },
  };
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function VideoWatchPage({ params }: { params: Params }) {
  const { slug } = await params;
  const catalog = await loadVideoCatalog();
  const video = findVideo(catalog, slug);
  if (!video) notFound();

  const transcripts = await loadVideoTranscripts();
  const transcript = transcripts[video.videoId];
  const pageUrl = videoPageUrl(video);
  const siblings = catalog.videos.filter((v) => v.group === video.group);
  const idx = siblings.findIndex((v) => v.slug === video.slug);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const guideSlug = video.tutorialSlugs[0] || null;
  const published = formatDate(video.publishedAt);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      videoObject(video, pageUrl),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Videos", item: `${SITE_ORIGIN}/videos` },
          { "@type": "ListItem", position: 3, name: video.title, item: pageUrl },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-[#c2410c]">
                Home
              </Link>
              <span aria-hidden="true"> / </span>
            </li>
            <li>
              <Link href="/videos" className="hover:text-[#c2410c]">
                Videos
              </Link>
              <span aria-hidden="true"> / </span>
            </li>
            <li aria-current="page" className="text-slate-700">
              {video.group}
            </li>
          </ol>
        </nav>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{video.title}</h1>
        <p className="mt-3 text-sm text-slate-500">
          {formatDuration(video.seconds)} walkthrough
          {published ? <> &middot; published {published}</> : null}
          {" "}&middot; recorded inside the app, narrated start to finish
        </p>

        <VideoEmbed video={video} transcript={transcript} className="mt-6" />

        {video.description ? <p className="mt-6 text-base leading-relaxed text-slate-700">{video.description}</p> : null}

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          {video.featureSlug ? (
            <a
              href={`/features/${video.featureSlug}`}
              className="rounded-lg bg-[#c2410c] px-4 py-2 font-semibold text-white hover:bg-[#9a3412] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
            >
              Read about this feature
            </a>
          ) : null}
          {guideSlug ? (
            <Link
              href={`/help/tutorials/${guideSlug}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 hover:border-slate-400"
            >
              Step-by-step guide (sign in)
            </Link>
          ) : null}
          <a
            href={watchUrl(video.videoId)}
            rel="noopener"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 hover:border-slate-400"
          >
            Watch on YouTube
          </a>
        </div>

        {prev || next ? (
          <nav aria-label="More in this group" className="mt-12 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2">
            {prev ? (
              <Link href={`/videos/${prev.slug}`} className="group rounded-xl border border-slate-200 p-4 hover:border-[#f97316]">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous</span>
                <span className="mt-1 block font-semibold text-slate-900 group-hover:text-[#c2410c]">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/videos/${next.slug}`}
                className="group rounded-xl border border-slate-200 p-4 text-right hover:border-[#f97316]"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next</span>
                <span className="mt-1 block font-semibold text-slate-900 group-hover:text-[#c2410c]">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        ) : null}

        <p className="mt-10 text-sm text-slate-500">
          <Link href="/videos" className="font-semibold text-[#c2410c]">
            All walkthrough videos
          </Link>
        </p>
      </article>
    </>
  );
}
