import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  parseFrontmatter,
  loadBlogManifest,
  loadBlogPost,
  loadPublishedPosts,
  availableBlogLocales,
  resolveBlogLocale,
  isPublished,
  isListed,
  formatBlogDate,
  resolvePinImage,
  DEFAULT_BLOG_LOCALE,
  type BlogLocale,
} from "@/lib/blog";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import BlogShareButtons from "@/components/blog/BlogShareButtons";
import { buildPinDescription } from "@/lib/pinterest";
import { pickResources, type LinkKind } from "@/lib/blog-links";
import { authorJsonLd, findBlogAuthor, resolveModifiedDate } from "@/lib/blog-authors";

export const revalidate = 300;

const SITE = "https://www.influencerbutler.com";

// Human label for each locale, shown in the language switcher.
const LOCALE_LABEL: Record<BlogLocale, string> = {
  "en-US": "English",
  "es-ES": "Español",
  "fr-FR": "Français",
};

// Small UI dictionary for the chrome around a post (the article body itself is
// fully translated in its own .<locale>.mdx file). Keeps a translated page from
// showing English navigation and calls to action.
const UI: Record<BlogLocale, {
  back: string;
  by: string;
  updated: string;
  goDeeper: string;
  goDeeperLead: string;
  kinds: Record<LinkKind, string>;
  moreIn: string;
  latest: string;
  ctaTitle: string;
  ctaBody: string;
  ctaBtn: string;
  tryTitle: string;
  tryBody: string;
  tryBtn: string;
}> = {
  "en-US": {
    back: "Back to blog",
    by: "By",
    updated: "Updated",
    goDeeper: "Tools and guides for this topic",
    goDeeperLead: "Put this into practice with the tools and walkthroughs that match what you just read.",
    kinds: { feature: "Feature", tool: "Free tool", guide: "Guide", course: "Free course", extension: "Free extension" },
    moreIn: "More in",
    latest: "Latest posts",
    ctaTitle: "Let a butler handle the busywork.",
    ctaBody:
      "Influencer Butler automates the repetitive parts of running your creator business, from accepting Creator Connections campaigns to catching price drops and keeping your outreach moving. Try it free for 14 days.",
    ctaBtn: "Start your free trial",
    tryTitle: "Try Influencer Butler",
    tryBody:
      "The all-in-one command center for creators and influencers. 14-day free trial, cancel anytime.",
    tryBtn: "Get started",
  },
  "es-ES": {
    back: "Volver al blog",
    by: "Por",
    updated: "Actualizado",
    goDeeper: "Herramientas y guías sobre este tema",
    goDeeperLead: "Pon esto en práctica con las herramientas y guías relacionadas.",
    kinds: { feature: "Función", tool: "Herramienta gratis", guide: "Guía", course: "Curso gratis", extension: "Extensión gratis" },
    moreIn: "Más en",
    latest: "Últimas publicaciones",
    ctaTitle: "Deja que un butler se encargue del trabajo repetitivo.",
    ctaBody:
      "Influencer Butler automatiza las partes repetitivas de gestionar tu negocio como creador, desde aceptar campañas de Creator Connections hasta detectar bajadas de precio y mantener tu contacto con marcas en marcha. Pruébalo gratis durante 14 días.",
    ctaBtn: "Empieza tu prueba gratuita",
    tryTitle: "Prueba Influencer Butler",
    tryBody:
      "El centro de mando todo en uno para creadores e influencers. Prueba gratuita de 14 días, cancela cuando quieras.",
    tryBtn: "Empezar",
  },
  "fr-FR": {
    back: "Retour au blog",
    by: "Par",
    updated: "Mis à jour",
    goDeeper: "Outils et guides sur ce sujet",
    goDeeperLead: "Mettez cela en pratique avec les outils et guides correspondants.",
    kinds: { feature: "Fonction", tool: "Outil gratuit", guide: "Guide", course: "Cours gratuit", extension: "Extension gratuite" },
    moreIn: "Plus dans",
    latest: "Derniers articles",
    ctaTitle: "Laissez un butler s'occuper des tâches répétitives.",
    ctaBody:
      "Influencer Butler automatise les parties répétitives de la gestion de votre activité de créateur, de l'acceptation des campagnes Creator Connections à la détection des baisses de prix, en passant par le suivi de votre prospection. Essayez-le gratuitement pendant 14 jours.",
    ctaBtn: "Démarrez votre essai gratuit",
    tryTitle: "Essayez Influencer Butler",
    tryBody:
      "Le centre de commande tout-en-un pour les créateurs et les influenceurs. Essai gratuit de 14 jours, annulable à tout moment.",
    tryBtn: "Commencer",
  },
};

// Canonical URL for a post in a given locale: English stays clean at /blog/slug;
// other locales carry ?lang= so each translation has its own indexable URL.
function localeUrl(slug: string, locale: BlogLocale): string {
  return locale === DEFAULT_BLOG_LOCALE
    ? `${SITE}/blog/${slug}`
    : `${SITE}/blog/${slug}?lang=${locale}`;
}

export async function generateStaticParams() {
  // Only pre-build posts that have actually published. Future-dated posts are
  // generated on demand (ISR) once their date arrives.
  const posts = await loadPublishedPosts();
  return posts.map((entry) => ({ slug: entry.id }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await searchParams;
  const locale = resolveBlogLocale(lang);
  const manifest = await loadBlogManifest();
  const entry = manifest.posts.find((p) => p.id === slug);
  const post = await loadBlogPost(slug, locale);
  if (!post) return { title: "Post not found - Influencer Butler" };

  const title = (post.frontmatter.title as string) || entry?.title || slug;
  const description =
    (post.frontmatter.summary as string) || entry?.summary || "";
  const image = (post.frontmatter.image as string) || entry?.image || "";
  const keywords = (post.frontmatter.keywords as string) || entry?.keywords || "";
  const absImage = image ? `${SITE}${image}` : undefined;
  const published = entry?.date || (post.frontmatter.date as string);
  const modifiedAt = resolveModifiedDate(
    published,
    entry?.updated || (post.frontmatter.updated as string | undefined),
  );

  // hreflang map over every locale this post actually ships, plus x-default.
  const locales = await availableBlogLocales(slug);
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = localeUrl(slug, l);
  languages["x-default"] = localeUrl(slug, DEFAULT_BLOG_LOCALE);

  return {
    // The root layout's title template already appends " | Influencer Butler".
    title,
    description,
    keywords,
    alternates: {
      // Canonical is the served locale (English serves clean; fallback pages
      // canonicalize to English so we never index a duplicate under ?lang=).
      canonical: localeUrl(slug, post.locale),
      languages,
    },
    openGraph: {
      title,
      description,
      url: localeUrl(slug, post.locale),
      type: "article",
      siteName: "Influencer Butler",
      locale: post.locale.replace("-", "_"),
      publishedTime: published,
      ...(modifiedAt !== published ? { modifiedTime: modifiedAt } : {}),
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const post = await loadBlogPost(slug, lang);
  if (!post) notFound();

  const locale = post.locale;
  const t = UI[locale];
  const locales = await availableBlogLocales(slug);
  const langHref = (l: BlogLocale) =>
    l === DEFAULT_BLOG_LOCALE ? `/blog/${slug}` : `/blog/${slug}?lang=${l}`;

  const manifest = await loadBlogManifest();
  const entry = manifest.posts.find((p) => p.id === slug);

  // Retired posts (a seasonal run that is over) keep their files but send
  // readers to the blog index. Temporary redirect on purpose: the post can be
  // un-retired next season without fighting a browser-cached 301.
  if (entry?.retired) redirect("/blog");

  // Date gate: a future-dated post is not live yet, so 404 until its day.
  const publishDate = entry?.date || (post.frontmatter.date as string);
  if (!isPublished(publishDate)) notFound();

  const category = (post.frontmatter.category as string) || entry?.category || "Blog";
  const tags = ((post.frontmatter.tags as string) || entry?.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const title = (post.frontmatter.title as string) || entry?.title || slug;
  const summary = (post.frontmatter.summary as string) || entry?.summary || "";
  const author = (post.frontmatter.author as string) || entry?.author || "Influencer Butler Team";
  const date = entry?.date || (post.frontmatter.date as string) || "";
  const modified = resolveModifiedDate(
    date,
    entry?.updated || (post.frontmatter.updated as string | undefined),
  );
  const authorProfile = findBlogAuthor(author);
  const readingTime = (post.frontmatter.readingTime as string) || entry?.readingTime || "";
  const keywords = (post.frontmatter.keywords as string) || entry?.keywords || "";
  const image = (post.frontmatter.image as string) || entry?.image || "";
  const imageAlt = (post.frontmatter.imageAlt as string) || entry?.imageAlt || title;

  const shareUrl = localeUrl(slug, locale);
  // Pinterest prefers a vertical pin image. The manifest pre-wires pinImage to
  // /assets/blog/pins/<slug>.png; resolvePinImage uses it once that file exists
  // and otherwise falls back to the landscape hero, so shares never point at a
  // missing image.
  const pinImage = resolvePinImage(entry?.pinImage, image);
  const shareImage = pinImage ? `${SITE}${pinImage}` : "";
  const pinDescription = buildPinDescription(title, summary, keywords);

  const live = manifest.posts.filter((p) => isListed(p));
  const related = live
    .filter((p) => p.category === category && p.id !== slug)
    .slice(0, 3);
  const morePosts = live.filter((p) => p.id !== slug).slice(0, 4);
  const resources = pickResources({
    title,
    summary,
    keywords,
    category,
    body: parseFrontmatter(post.raw).body,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: summary,
    image: image ? `${SITE}${image}` : undefined,
    datePublished: date,
    dateModified: modified,
    author: authorJsonLd(author),
    publisher: {
      "@type": "Organization",
      name: "Influencer Butler",
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/assets/influencer-butler-logo.png`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": shareUrl },
    articleSection: category,
    inLanguage: locale,
  };

  return (
    <main id="main-content" className="min-h-screen bg-white text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader />

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article lang={locale}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-orange-600"
            >
              {t.back}
            </Link>
            {locales.length > 1 ? (
              <nav aria-label="Language" className="flex items-center gap-2 text-xs">
                {locales.map((l) => (
                  <Link
                    key={l}
                    href={langHref(l)}
                    hrefLang={l}
                    aria-current={l === locale ? "true" : undefined}
                    className={
                      l === locale
                        ? "rounded-full bg-orange-700 px-3 py-1 font-semibold text-white"
                        : "rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-orange-300 hover:text-orange-600"
                    }
                  >
                    {LOCALE_LABEL[l]}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              href={`/blog?tag=${encodeURIComponent(category)}`}
              className="text-xs font-semibold uppercase tracking-widest text-orange-700 hover:underline"
            >
              {category}
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog?tag=${encodeURIComponent(tag)}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-700"
              >
                {tag}
              </Link>
            ))}
          </div>
          <h1 className="help-article-title">{title}</h1>
          {summary ? <p className="help-article-lead">{summary}</p> : null}
          <p className="mt-4 text-sm text-slate-500">
            {t.by}{" "}
            {authorProfile ? (
              <a href={authorProfile.path} rel="author" className="font-medium text-slate-700 underline hover:text-orange-700">
                {author}
              </a>
            ) : (
              author
            )}
            {date ? ` · ${formatBlogDate(date, locale)}` : ""}
            {modified !== date ? ` · ${t.updated} ${formatBlogDate(modified, locale)}` : ""}
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

          {resources.length ? (
            <section aria-labelledby="go-deeper-heading" className="mt-12">
              <h2 id="go-deeper-heading" className="text-xl font-bold tracking-tight text-slate-900">
                {t.goDeeper}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{t.goDeeperLead}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {resources.map((r) => (
                  <li key={r.href}>
                    <a
                      href={r.href}
                      className="block h-full rounded-xl border border-slate-200 p-4 transition hover:border-orange-300 hover:bg-orange-50/40"
                    >
                      <span className="text-xs font-semibold uppercase tracking-widest text-orange-700">
                        {t.kinds[r.kind]}
                      </span>
                      <span className="mt-1 block font-semibold text-slate-900">{r.label}</span>
                      {locale === DEFAULT_BLOG_LOCALE ? (
                        <span className="mt-1 block text-sm text-slate-600">{r.blurb}</span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {authorProfile ? (
            <aside className="mt-10 flex items-start gap-4 rounded-2xl border border-slate-200 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={authorProfile.image}
                alt={authorProfile.name}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover"
                loading="lazy"
              />
              <div>
                <p className="font-semibold text-slate-900">
                  <a href={authorProfile.path} rel="author" className="hover:text-orange-700">
                    {authorProfile.name}
                  </a>
                </p>
                <p className="text-sm text-slate-500">{authorProfile.jobTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{authorProfile.bio}</p>
              </div>
            </aside>
          ) : null}

          <div className="mt-12 rounded-2xl border border-orange-200 bg-orange-50 p-8">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {t.ctaTitle}
            </h2>
            <p className="mt-3 text-slate-600">{t.ctaBody}</p>
            <a
              href="/go/trial?src=blog-post"
              className="mt-5 inline-block rounded-md bg-orange-700 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-800"
            >
              {t.ctaBtn}
            </a>
          </div>
        </article>

        <aside className="space-y-8 lg:sticky lg:top-8 lg:self-start lg:border-l lg:border-slate-200 lg:pl-8">
          {related.length ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {t.moreIn} {category}
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
              {t.latest}
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
              {t.tryTitle}
            </h2>
            <p className="mt-3 text-sm text-slate-600">{t.tryBody}</p>
            <Link
              href="/signup"
              className="mt-4 inline-block rounded-md bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800"
            >
              {t.tryBtn}
            </Link>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </main>
  );
}
