import Link from "next/link";
import { notFound } from "next/navigation";
import { loadManifest, loadTutorial } from "@/lib/tutorials";
import { getCourseModules, getSeriesForTutorial } from "@/lib/course";
import CourseProgress from "@/components/course-progress";

export const revalidate = 300;

export async function generateStaticParams() {
  const manifest = await loadManifest();
  return manifest.tutorials.map((entry) => ({ slug: entry.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tutorial = await loadTutorial(slug);
  if (!tutorial) return { title: "Tutorial not found - Influencer Butler" };
  const title = (tutorial.frontmatter.title as string) || tutorial.id;
  return {
    title: `${title} - Influencer Butler`,
    description: (tutorial.frontmatter.summary as string) || "",
  };
}

export default async function TutorialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tutorial = await loadTutorial(slug);
  if (!tutorial) notFound();

  const manifest = await loadManifest();
  const current = manifest.tutorials.find((entry) => entry.id === slug);
  const category = current?.category || "Tutorial";
  const siblings = manifest.tutorials.filter((entry) => entry.category === category && entry.id !== slug);
  const title = (tutorial.frontmatter.title as string) || current?.title || slug;
  const summary = (tutorial.frontmatter.summary as string) || current?.summary || "";
  const seriesId = getSeriesForTutorial(current);
  const courseModules = seriesId
    ? getCourseModules(manifest, seriesId).map((m) => ({
        id: m.id,
        title: m.title,
        seriesOrder: m.seriesOrder,
      }))
    : [];

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            ← Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/help" className="text-slate-700 hover:text-slate-900">
              Help
            </Link>
            <Link href="/help/community" className="text-slate-700 hover:text-slate-900">
              Community Q&amp;A
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className={seriesId ? "course-article" : undefined}>
          <Link
            href="/help"
            className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-orange-600"
          >
            ← Help
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-600">
            {category}
          </p>
          <h1 className="help-article-title">{title}</h1>
          {summary ? <p className="help-article-lead">{summary}</p> : null}
          <div
            className="help-tutorial-body"
            dangerouslySetInnerHTML={{ __html: tutorial.html }}
          />
          {seriesId ? (
            <CourseProgress
              seriesId={seriesId}
              moduleId={slug}
              modules={courseModules}
              basePath="/help/tutorials"
            />
          ) : null}
        </article>

        <aside className="space-y-8 lg:sticky lg:top-8 lg:self-start lg:border-l lg:border-slate-200 lg:pl-8">
          {siblings.length ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                More in {category}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-snug">
                {siblings.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/help/tutorials/${entry.id}`}
                      className="block text-slate-700 hover:text-orange-600"
                    >
                      {entry.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Need more help?
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Search community questions or post your own.
            </p>
            <Link
              href={`/help/community?workspace=${encodeURIComponent(slug)}`}
              className="mt-4 inline-block rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Open community Q&amp;A
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
