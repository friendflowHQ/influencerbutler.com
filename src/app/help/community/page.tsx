import Link from "next/link";
import { loadManifest } from "@/lib/tutorials";

export const metadata = {
  title: "Community Q&A — Influencer Butler",
  description: "Questions from Influencer Butler users and answers from the community.",
};

export const dynamic = "force-dynamic";

type ApiQuestion = {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  upvotes: number;
  answerCount: number;
  createdAt: number;
};

async function fetchQuestions(workspace?: string): Promise<ApiQuestion[]> {
  const base =
    process.env.FEEDBACK_WORKER_URL ||
    "https://influencerbutler-feedback.thesocialmediaposse.workers.dev";
  const url = new URL(`${base.replace(/\/+$/, "")}/questions`);
  url.searchParams.set("sort", "top");
  url.searchParams.set("limit", "50");
  if (workspace) url.searchParams.set("workspace", workspace);
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { ok?: boolean; questions?: ApiQuestion[] };
    if (!json.ok) return [];
    return Array.isArray(json.questions) ? json.questions : [];
  } catch {
    return [];
  }
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace } = await searchParams;
  const [questions, manifest] = await Promise.all([
    fetchQuestions(workspace),
    loadManifest(),
  ]);

  const titlesById = new Map(manifest.tutorials.map((entry) => [entry.id, entry.title]));

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            ← Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/help" className="text-slate-700 hover:text-slate-900">
              Help
            </Link>
            <Link href="/help/community" className="font-semibold text-slate-900">
              Community Q&amp;A
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Community Q&amp;A</h1>
            <p className="mt-2 text-slate-600">
              Questions from Butler users. Answers come from the community plus the team.
            </p>
          </div>
          <Link
            href="/help/community/ask"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            + Ask a question
          </Link>
        </div>

        <form method="get" className="mt-6 flex items-center gap-3">
          <label htmlFor="workspace-filter" className="text-sm font-medium text-slate-700">
            Filter:
          </label>
          <select
            id="workspace-filter"
            name="workspace"
            defaultValue={workspace || ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All workspaces</option>
            {manifest.tutorials.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Apply
          </button>
        </form>

        <ul className="mt-8 space-y-3">
          {questions.length === 0 ? (
            <li className="rounded border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No questions yet — be the first to{" "}
              <Link href="/help/community/ask" className="text-orange-600 underline">
                ask one
              </Link>
              .
            </li>
          ) : (
            questions.map((question) => (
              <li
                key={question.id}
                className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-orange-500"
              >
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  {titlesById.get(question.workspaceId) || question.workspaceId}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{question.title}</h2>
                {question.body ? (
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">{question.body}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <span>{question.upvotes} upvotes</span>
                  <span>{question.answerCount} answers</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
