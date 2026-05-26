import Link from "next/link";
import { loadManifest } from "@/lib/tutorials";
import { WorkspaceIcon } from "@/components/workspace-icon";

export const metadata = {
  title: "Help & Tutorials - Influencer Butler",
  description:
    "Step-by-step setup and how-to guides for every Influencer Butler workspace, plus a community Q&A for questions.",
};

export const revalidate = 300;

export default async function HelpLandingPage() {
  const manifest = await loadManifest();
  const categories = new Map<string, typeof manifest.tutorials>();
  for (const entry of manifest.tutorials) {
    const key = entry.category || "Other";
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key)!.push(entry);
  }

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

        <div className="mt-10 grid gap-10">
          {Array.from(categories.entries()).map(([category, entries]) => (
            <section key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                {category}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/help/tutorials/${entry.id}`}
                    className="block rounded-lg border border-slate-200 bg-white p-5 transition hover:border-orange-500 hover:shadow"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-orange-50 text-orange-600">
                      <WorkspaceIcon id={entry.id} />
                    </span>
                    <h3 className="mt-4 font-semibold text-slate-900">{entry.title}</h3>
                    {entry.summary ? (
                      <p className="mt-2 text-sm text-slate-600">{entry.summary}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        {manifest.tutorials.length === 0 ? (
          <p className="mt-12 rounded border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No tutorials are published yet - check back soon.
          </p>
        ) : null}
      </section>
    </main>
  );
}
