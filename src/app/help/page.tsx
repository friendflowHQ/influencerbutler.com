import Link from "next/link";
import { loadSearchIndex } from "@/lib/tutorials";
import { HelpSearch } from "./help-search";

export const metadata = {
  title: "Help & Tutorials - Influencer Butler",
  description:
    "Step-by-step setup and how-to guides for every Influencer Butler workspace, plus a community Q&A for questions.",
};

export const revalidate = 300;

export default async function HelpLandingPage() {
  const items = await loadSearchIndex();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            ← Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/help" className="font-semibold text-slate-900">
              Help
            </Link>
            <Link href="/help/community" className="text-slate-700 hover:text-slate-900">
              Community Q&amp;A
            </Link>
            <Link href="/course/amazon-influencer" className="text-slate-700 hover:text-slate-900">
              Free Course
            </Link>
            <Link href="/dashboard/book" className="text-slate-400 hover:text-slate-600">
              Talk to a human
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Help &amp; Tutorials</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Every workspace, explained. Pick a topic below or jump to the{" "}
          <Link href="/help/community" className="text-orange-600 underline">
            community Q&amp;A
          </Link>{" "}
          to ask other Butler users.
        </p>

        {items.length === 0 ? (
          <p className="mt-12 rounded border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No tutorials are published yet - check back soon.
          </p>
        ) : (
          <HelpSearch items={items} />
        )}
      </section>
    </main>
  );
}
