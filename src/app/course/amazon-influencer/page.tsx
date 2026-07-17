/**
 * Course hub for the free "Beginner's Guide to Becoming an Amazon Influencer"
 * course. Server-rendered module list (SEO + Course JSON-LD); the client
 * overlay adds completion checkmarks, the resume link handler, and the
 * continue button from localStorage progress.
 */
import Link from "next/link";
import { loadManifest } from "@/lib/tutorials";
import { AMAZON_INFLUENCER_COURSE_ID, getCourseModules, moduleEmoji } from "@/lib/course";
import { courseImage } from "@/lib/course-images";
import NewsletterSignup from "@/components/NewsletterSignup";
import CourseHubClient from "./course-hub-client";

export const revalidate = 300;

const PAGE_TITLE = "Free Amazon Influencer Course: Beginner to First Commissions";
const PAGE_DESCRIPTION =
  "A free, start-to-finish course on becoming an Amazon Influencer: applying, onsite video approval, filming, your storefront, and your first 30 days. Interactive check-off progress, no email required.";

export async function generateMetadata() {
  return {
    title: `${PAGE_TITLE} - Influencer Butler`,
    description: PAGE_DESCRIPTION,
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      type: "website",
      url: "https://www.influencerbutler.com/course/amazon-influencer",
    },
  };
}

export default async function CourseHubPage() {
  const manifest = await loadManifest();
  const modules = getCourseModules(manifest, AMAZON_INFLUENCER_COURSE_ID);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    provider: {
      "@type": "Organization",
      name: "Influencer Butler",
      url: "https://www.influencerbutler.com",
    },
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      category: "Free",
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: "PT4H",
    },
    syllabusSections: modules.map((m) => ({
      "@type": "Syllabus",
      name: m.title,
      description: m.summary,
    })),
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            ← Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/help" className="text-slate-700 hover:text-slate-900">
              Help
            </Link>
            <Link href="/blog" className="text-slate-700 hover:text-slate-900">
              Blog
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
          Free course · No sign-up required
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          The Beginner&apos;s Guide to Becoming an Amazon Influencer
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Everything the paid starter courses teach, free: from &quot;what even is this
          program&quot; to onsite video approval, your first uploads, and a week-by-week plan.
          Check off steps as you go; your progress saves automatically in your browser.
        </p>
        {courseImage("aip-course-01-start-here") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={courseImage("aip-course-01-start-here") as string}
            alt=""
            className="course-hero-image mt-8"
            width={1200}
            height={800}
            loading="eager"
          />
        ) : null}

        <CourseHubClient
          seriesId={AMAZON_INFLUENCER_COURSE_ID}
          modules={modules.map((m) => ({ id: m.id, title: m.title, seriesOrder: m.seriesOrder }))}
        />

        <ol className="mt-10 space-y-4">
          {modules.map((m, i) => {
            const thumb = courseImage(m.id);
            return (
              <li key={m.id}>
                <Link
                  href={`/course/amazon-influencer/${m.id}`}
                  data-course-module={m.id}
                  className="group flex items-start gap-4 rounded-xl border border-slate-200 p-5 transition hover:border-orange-400 hover:shadow-sm"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="hidden h-20 w-32 shrink-0 rounded-lg object-cover sm:block"
                      width={128}
                      height={80}
                      loading="lazy"
                    />
                  ) : null}
                  <span
                    data-module-badge
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-xl group-hover:bg-orange-100"
                  >
                    {moduleEmoji(m.id)}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Module {i + 1}
                    </span>
                    <span className="block font-semibold text-slate-900 group-hover:text-orange-700">
                      {m.title}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">{m.summary}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="mt-12 rounded-xl border border-orange-200 bg-orange-50 p-6">
          <NewsletterSignup
            source="course"
            title="Want the shortcuts emailed to you?"
            subtitle="Get the free weekly newsletter: one practical Amazon Influencer tip per issue, no fluff. Unsubscribe anytime."
          />
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          <p>
            Built by the team behind{" "}
            <Link href="/" className="font-semibold text-orange-700 hover:underline">
              Influencer Butler
            </Link>
            , the desktop app that automates the repetitive parts of being an Amazon
            influencer. The course is complete without it; the app exists for when you reach
            the scaling stage in Module 10.
          </p>
          <a
            href="/go/trial?src=course"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700"
          >
            Start your free 14-day Pro trial
          </a>
        </div>
      </section>
    </main>
  );
}
