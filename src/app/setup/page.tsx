import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTutorial } from "@/lib/tutorials";

// Public, no-index setup guide. Unlike /help/tutorials/* (which middleware.ts
// auth-gates), this route lives outside the protected prefixes so a brand-new
// user who is not signed in can open it straight from the app walkthrough or a
// shared link. It renders the same getting-started tutorial content, authored
// once in content/tutorials.

const TUTORIAL_ID = "getting-started-influencer-butler";
const SUPPORTED = ["en-US", "es-ES", "fr-FR"] as const;

export const revalidate = 300;

export const metadata = {
  title: "Getting started - Influencer Butler",
  description:
    "Brand new to Influencer Butler? Sign in, connect your Amazon storefront, and run your first Butler. No experience needed.",
  robots: {
    index: false,
    follow: true,
    nocache: true,
    googleBot: {
      index: false,
      follow: true,
      noimageindex: true,
    },
  },
};

type SearchParams = Promise<{ lang?: string }>;

export default async function SetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { lang } = await searchParams;
  const locale = (SUPPORTED as readonly string[]).includes(lang || "")
    ? (lang as string)
    : "en-US";

  const tutorial = await loadTutorial(TUTORIAL_ID, locale);
  if (!tutorial) notFound();

  const title = (tutorial.frontmatter.title as string) || "Getting started";
  const summary = (tutorial.frontmatter.summary as string) || "";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-slate-700 hover:text-slate-900">
              Home
            </Link>
            <Link
              href="/course/amazon-influencer"
              className="text-slate-700 hover:text-slate-900"
            >
              Free Course
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <article>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
            Getting Started
          </p>
          <h1 className="help-article-title">{title}</h1>
          {summary ? <p className="help-article-lead">{summary}</p> : null}
          <div
            className="help-tutorial-body"
            dangerouslySetInnerHTML={{ __html: tutorial.html }}
          />
        </article>
      </section>
    </main>
  );
}
