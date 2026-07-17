import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  loadBlogManifest,
  loadBlogPost,
  loadPublishedPosts,
  isPublished,
  formatBlogDate,
  resolvePinImage,
} from "@/lib/blog";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import BlogShareButtons from "@/components/blog/BlogShareButtons";
import { buildPinDescription } from "@/lib/pinterest";

export const revalidate = 300;

const SITE = "https://www.influencerbutler.com";

export async function generateStaticParams() {
  // Only pre-build posts that have actually published. Future-dated posts are
  // generated on demand (ISR) once their date arrives.
  const posts = await loadPublishedPosts();
  return posts.map((entry) => ({ slug: entry.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await loadBlogManifest();
  const entry = manifest.posts.find((p) => p.id === slug);
  const post = await loadBlogPost(slug);
  if (!post) return { title: "Post not found - Influencer Butler" };

  const title = (post.frontmatter.title as string) || entry?.title || slug;
  const description =
    (post.frontmatter.summary as string) || entry?.summary || "";
  const image = (post.frontmatter.image as string) || entry?.image || "";
  const keywords = (post.frontmatter.keywords as string) || entry?.keywords || "";
  const absImage = image ? `${SITE}${image}` : undefined;
  const published = entry?.date || (post.frontmatter.date as string);

  return {
    title: `${title} | Influencer Butler`,
    description,
    keywords,
    alternates: { canonical: `${SITE}/blog/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE}/blog/${slug}`,
      type: "article",
      siteName: "Influencer Butler",
      publishedTime: published,
      images: absImage ? [{ url: absImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: absImage ? [absImage] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadBlogPost(slug);
  if (!post) notFound();

  const manifest = await loadBlogManifest();
  const entry = manifest.posts.find((p) => p.id === slug);

  // Date gate: a future-dated post is not live yet, so 404 until its day.
  const publishDate = entry?.date || (post.frontmatter.date as string);
  if (!isPublished(publishDate)) notFound();

  const category = (post.frontmatter.category as string) || entry?.category || "Blog";
  const title = (post.frontmatter.title as string) || entry?.title || slug;
  const summary = (post.frontmatter.summary as string) || entry?.summary || "";
  const author = (post.frontmatter.author as string) || entry?.author || "Influencer Butler Team";
  const date = entry?.date || (post.frontmatter.date as string) || "";
  const readingTime = (post.frontmatter.readingTime as string) || entry?.readingTime || "";
  const keywords = (post.frontmatter.keywords as string) || entry?.keywords || "";
  const image = (post.frontmatter.image as string) || entry?.image || "";
  const imageAlt = (post.frontmatter.imageAlt as string) || entry?.imageAlt || title;

  const shareUrl = `${SITE}/blog/${slug}`;
  // Pinterest prefers a vertical pin image. The manifest pre-wires pinImage to
  // /assets/blog/pins/<slug>.png; resolvePinImage uses it once that file exists
  // and otherwise falls back to the landscape hero, so shares never point at a
  // missing image.
  const pinImage = resolvePinImage(entry?.pinImage, image);
  const shareImage = pinImage ? `${SITE}${pinImage}` : "";
  const pinDescription = buildPinDescription(title, summary, keywords);

  const live = manifest.posts.filter((p) => isPublished(p.date));
  const related = live
    .filter((p) => p.category === category && p.id !== slug)
    .slice(0, 3);
  const morePosts = live.filter((p) => p.id !== slug).slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: summary,
    image: image ? `${SITE}${image}` : undefined,
    datePublished: date,
    dateModified: date,
    author: { "@type": "Organization", name: author, url: SITE },
    publisher: {
      "@type": "Organization",
      name: "Influencer Butler",
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/assets/influencer-butler-logo.png`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/blog/${slug}` },
    articleSection: category,
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader />

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article>
          <Link
            href="/blog"
            className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-orange-600"
          >
            Back to blog
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-600">
            {category}
          </p>
          <h1 className="help-article-title">{title}</h1>
          {summary ? <p className="help-article-lead">{summary}</p> : null}
          <p className="mt-4 text-sm text-slate-500">
            By {author}
            {date ? ` · ${formatBlogDate(date)}` : ""}
            {readingTime ? ` · ${readingTime}` : ""}
          </p>

          {image ? (
            <figure className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt={imageAlt}
                className="h-auto w-full object-cover"
                loading="eager"
                data-pin-url={shareUrl}
                data-pin-description={pinDescription}
              />
            </figure>
          ) : null}

          <div
            className="help-tutorial-body mt-8"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />

          <BlogShareButtons
            url={shareUrl}
            title={title}
            summary={summary}
            image={shareImage}
            keywords={keywords}
          />

          <div className="mt-12 rounded-2xl border border-orange-200 bg-orange-50 p-8">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Let a butler handle the busywork.
            </h2>
            <p className="mt-3 text-slate-600">
              Influencer Butler automates the repetitive parts of running your
              creator business, from accepting Creator Connections campaigns to
              catching price drops and keeping your outreach moving. Try it free
              for 14 days.
            </p>
            <a
              href="/go/trial?src=blog-post"
              className="mt-5 inline-block rounded-md bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Start your free trial
            </a>
          </div>
        </article>

        <aside className="space-y-8 lg:sticky lg:top-8 lg:self-start lg:border-l lg:border-slate-200 lg:pl-8">
          {related.length ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                More in {category}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-snug">
                {related.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/blog/${p.id}`}
                      className="block text-slate-700 hover:text-orange-600"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Latest posts
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-snug">
              {morePosts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/blog/${p.id}`}
                    className="block text-slate-700 hover:text-orange-600"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Try Influencer Butler
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              The all-in-one command center for creators and influencers. 14-day free
              trial, cancel anytime.
            </p>
            <Link
              href="/signup"
              className="mt-4 inline-block rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Get started
            </Link>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </main>
  );
}
