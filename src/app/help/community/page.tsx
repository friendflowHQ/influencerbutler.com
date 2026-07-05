import Link from "next/link";
import { loadManifest } from "@/lib/tutorials";
import { createClient } from "@/lib/supabase/server";
import { resolveCommunityAuthors } from "@/lib/community-authors";
import AuthorChip from "@/components/community/AuthorChip";

export const metadata = {
  title: "Community Q&A - Influencer Butler",
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
  authorId: string | null;
  authorEmail: string | null;
};

type QuestionRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  upvotes: number | null;
  answer_count: number | null;
  created_at: string;
  author_id: string | null;
  author_email: string | null;
};

type Filterable = {
  eq: (col: string, value: string) => Filterable;
  order: (col: string, opts: { ascending: boolean }) => Filterable;
  limit: (n: number) => Promise<{ data: QuestionRow[] | null; error: unknown }>;
};

type ListClient = {
  from: (table: string) => {
    select: (cols: string) => Filterable;
  };
};

async function fetchQuestions(workspace?: string): Promise<ApiQuestion[]> {
  try {
    const supabase = (await createClient()) as unknown as ListClient;
    let query: Filterable = supabase
      .from("community_questions")
      .select(
        "id, workspace_id, title, body, upvotes, answer_count, created_at, author_id, author_email",
      )
      .eq("status", "approved");

    if (workspace) {
      query = query.eq("workspace_id", workspace);
    }

    const { data, error } = await query
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      body: row.body ?? "",
      upvotes: row.upvotes ?? 0,
      answerCount: row.answer_count ?? 0,
      createdAt: new Date(row.created_at).getTime(),
      authorId: row.author_id ?? null,
      authorEmail: row.author_email ?? null,
    }));
  } catch (err) {
    console.error("fetchQuestions failed", err);
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

  const titlesById = new Map<string, string>(
    manifest.tutorials.map((entry) => [entry.id, entry.title]),
  );
  titlesById.set("other", "Other");

  const authors = await resolveCommunityAuthors(questions.map((q) => q.authorId));

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
            <Link href="/help/community" className="font-semibold text-slate-900">
              Community Q&amp;A
            </Link>
            <Link href="/course/amazon-influencer" className="text-slate-700 hover:text-slate-900">
              Free Course
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
            <option value="other">Other</option>
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
              No questions yet - be the first to{" "}
              <Link href="/help/community/ask" className="text-orange-600 underline">
                ask one
              </Link>
              .
            </li>
          ) : (
            questions.map((question) => (
              <li key={question.id}>
                <Link
                  href={`/help/community/${question.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-5 transition hover:border-orange-500"
                >
                  <p className="text-xs uppercase tracking-widest text-slate-500">
                    {titlesById.get(question.workspaceId) || question.workspaceId}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{question.title}</h2>
                  {question.body ? (
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{question.body}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                    <AuthorChip
                      author={question.authorId ? authors.get(question.authorId) : null}
                      fallbackEmail={question.authorEmail}
                      size="sm"
                    />
                    <span>{question.upvotes} upvotes</span>
                    <span>{question.answerCount} answers</span>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
