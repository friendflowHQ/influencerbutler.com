/**
 * Public course module pages: /course/amazon-influencer/<module-id>.
 * The /help center is login-gated for customers, so the free course gets its
 * own public routes. Renders the same tutorial content (loadTutorial) with
 * the interactive check-off progress component.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadManifest, loadTutorial } from "@/lib/tutorials";
import { AMAZON_INFLUENCER_COURSE_ID, getCourseModules, moduleEmoji } from "@/lib/course";
import { courseImage } from "@/lib/course-images";
import CourseProgress from "@/components/course-progress";

export const revalidate = 300;

const BASE_PATH = "/course/amazon-influencer";

export async function generateStaticParams() {
  const manifest = await loadManifest();
  return getCourseModules(manifest, AMAZON_INFLUENCER_COURSE_ID).map((m) => ({
    module: m.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: moduleId } = await params;
  const tutorial = await loadTutorial(moduleId);
  if (!tutorial) return { title: "Course module not found - Influencer Butler" };
  const title = (tutorial.frontmatter.title as string) || moduleId;
  const description = (tutorial.frontmatter.summary as string) || "";
  return {
    title: `${title} - Free Amazon Influencer Course`,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `https://www.influencerbutler.com${BASE_PATH}/${moduleId}`,
    },
  };
}

export default async function CourseModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: moduleId } = await params;
  const manifest = await loadManifest();
  const modules = getCourseModules(manifest, AMAZON_INFLUENCER_COURSE_ID);
  const current = modules.find((m) => m.id === moduleId);
  // Only course modules render here; other tutorial ids stay 404 so this
  // route never becomes a public mirror of the gated help center.
  if (!current) notFound();

  const tutorial = await loadTutorial(moduleId);
  if (!tutorial) notFound();

  const idx = modules.findIndex((m) => m.id === moduleId);
  const title = (tutorial.frontmatter.title as string) || current.title;
  const summary = (tutorial.frontmatter.summary as string) || current.summary;
  const heroSrc = courseImage(moduleId);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            ← Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href={BASE_PATH} className="text-slate-700 hover:text-slate-900">
              Course home
            </Link>
            <Link href="/blog" className="text-slate-700 hover:text-slate-900">
              Blog
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="course-article">
          <Link
            href={BASE_PATH}
            className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-orange-600"
          >
            ← All modules
          </Link>
          <div className="mt-6 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-2xl">
              {moduleEmoji(moduleId)}
            </span>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
              Free course · Module {idx + 1} of {modules.length}
            </p>
          </div>
          <h1 className="help-article-title">{title}</h1>
          {summary ? <p className="help-article-lead">{summary}</p> : null}
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroSrc}
              alt=""
              className="course-hero-image"
              width={1200}
              height={800}
              loading="eager"
            />
          ) : null}
          <div
            className="help-tutorial-body"
            dangerouslySetInnerHTML={{ __html: tutorial.html }}
          />
          <div className="mt-10 rounded-xl border border-orange-200 bg-orange-50 p-6">
            <p className="text-base font-semibold text-slate-900">
              {idx === modules.length - 1
                ? "Ready to scale? Let the app handle the repetitive parts."
                : "Want to automate this as you grow?"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Influencer Butler automates outreach, commission tracking, and posting so you
              can focus on filming. Try Pro free for 14 days, with no charge if you cancel
              before day 14.
            </p>
            <a
              href="/go/trial?src=course-module"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Start your free 14-day Pro trial
            </a>
          </div>
          <CourseProgress
            seriesId={AMAZON_INFLUENCER_COURSE_ID}
            moduleId={moduleId}
            modules={modules.map((m) => ({ id: m.id, title: m.title, seriesOrder: m.seriesOrder }))}
            basePath={BASE_PATH}
          />
        </article>

        <aside className="space-y-8 lg:sticky lg:top-8 lg:self-start lg:border-l lg:border-slate-200 lg:pl-8">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Course modules
            </h2>
            <ol className="mt-4 space-y-3 text-sm leading-snug">
              {modules.map((entry, i) => (
                <li key={entry.id}>
                  <Link
                    href={`${BASE_PATH}/${entry.id}`}
                    className={
                      entry.id === moduleId
                        ? "block font-semibold text-orange-700"
                        : "block text-slate-700 hover:text-orange-600"
                    }
                  >
                    <span className="mr-1.5">{moduleEmoji(entry.id)}</span>
                    {i + 1}. {entry.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
