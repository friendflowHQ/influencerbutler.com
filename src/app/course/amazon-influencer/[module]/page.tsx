/**
 * Public course module pages: /course/amazon-influencer/<module-id>.
 * The /help center is login-gated for customers, so the free course gets its
 * own public routes. Renders the same tutorial content (loadTutorial) with
 * the interactive check-off progress component.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadManifest, loadTutorial } from "@/lib/tutorials";
import { AMAZON_INFLUENCER_COURSE_ID, getCourseModules } from "@/lib/course";
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
        <article>
          <Link
            href={BASE_PATH}
            className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-orange-600"
          >
            ← All modules
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-600">
            Free course · Module {idx + 1} of {modules.length}
          </p>
          <h1 className="help-article-title">{title}</h1>
          {summary ? <p className="help-article-lead">{summary}</p> : null}
          <div
            className="help-tutorial-body"
            dangerouslySetInnerHTML={{ __html: tutorial.html }}
          />
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
