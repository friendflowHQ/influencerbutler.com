import Link from "next/link";
import { notFound } from "next/navigation";
import { loadManifest } from "@/lib/tutorials";
import { createClient } from "@/lib/supabase/server";
import UpvoteButton from "./UpvoteButton";
import AnswerForm from "./AnswerForm";

export const dynamic = "force-dynamic";

type QuestionRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  upvotes: number | null;
  answer_count: number | null;
  created_at: string;
  author_email: string | null;
};

type AnswerRow = {
  id: string;
  body: string;
  author_email: string | null;
  created_at: string;
};

type DetailClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string } | null };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        eq?: (col: string, value: string) => unknown;
        single?: () => Promise<{ data: QuestionRow | null; error: unknown }>;
        order?: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: AnswerRow[] | null; error: unknown }>;
        maybeSingle?: () => Promise<{
          data: { question_id: string } | null;
          error: unknown;
        }>;
      };
    };
  };
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { title: "Question — Influencer Butler" };
  }
  try {
    const supabase = (await createClient()) as unknown as DetailClient;
    const { data } = await (supabase
      .from("community_questions")
      .select("title") as unknown as {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          single: () => Promise<{ data: { title: string } | null }>;
        };
      };
    })
      .eq("id", id)
      .eq("status", "approved")
      .single();
    return {
      title: data?.title
        ? `${data.title} — Community Q&A`
        : "Question — Influencer Butler",
    };
  } catch {
    return { title: "Question — Influencer Butler" };
  }
}

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const supabase = (await createClient()) as unknown as DetailClient;

  const questionPromise = (supabase
    .from("community_questions")
    .select(
      "id, workspace_id, title, body, upvotes, answer_count, created_at, author_email",
    ) as unknown as {
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => {
        single: () => Promise<{ data: QuestionRow | null }>;
      };
    };
  })
    .eq("id", id)
    .eq("status", "approved")
    .single();

  const answersPromise = (supabase
    .from("community_answers")
    .select("id, body, author_email, created_at") as unknown as {
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => {
        order: (
          c: string,
          o: { ascending: boolean },
        ) => Promise<{ data: AnswerRow[] | null }>;
      };
    };
  })
    .eq("question_id", id)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  const [
    { data: question },
    { data: answers },
    { data: userData },
    manifest,
  ] = await Promise.all([
    questionPromise,
    answersPromise,
    supabase.auth.getUser(),
    loadManifest(),
  ]);

  if (!question) {
    notFound();
  }

  const userId = userData?.user?.id ?? null;
  const signedIn = userId !== null;

  // Has the current user upvoted this question? (RLS only lets them see
  // their own rows, so this is a single row read.)
  let upvoted = false;
  if (signedIn) {
    const upvoteRead = await (supabase
      .from("community_question_upvotes")
      .select("question_id") as unknown as {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{
            data: { question_id: string } | null;
          }>;
        };
      };
    })
      .eq("question_id", id)
      .eq("user_id", userId as string)
      .maybeSingle();
    upvoted = upvoteRead.data !== null;
  }

  const titlesById = new Map<string, string>(
    manifest.tutorials.map((entry) => [entry.id, entry.title]),
  );
  titlesById.set("other", "Other");

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
            <Link
              href="/help/community"
              className="text-slate-700 hover:text-slate-900"
            >
              Community Q&amp;A
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm">
          <Link href="/help/community" className="text-orange-600 hover:underline">
            ← All questions
          </Link>
        </p>

        <article className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            {titlesById.get(question.workspace_id) || question.workspace_id}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {question.title}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Asked {formatDate(question.created_at)}
            {question.author_email ? ` · ${question.author_email}` : null}
          </p>
          {question.body ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
              {question.body}
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-4">
            <UpvoteButton
              questionId={question.id}
              initialUpvotes={question.upvotes ?? 0}
              initialUpvoted={upvoted}
              signedIn={signedIn}
            />
            <span className="text-xs text-slate-500">
              {answers?.length ?? 0}{" "}
              {(answers?.length ?? 0) === 1 ? "answer" : "answers"}
            </span>
          </div>
        </article>

        <h2 className="mt-10 text-lg font-semibold text-slate-900">
          {(answers?.length ?? 0) === 0
            ? "No answers yet"
            : `${answers?.length} ${(answers?.length ?? 0) === 1 ? "answer" : "answers"}`}
        </h2>

        {answers && answers.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {answers.map((answer) => (
              <li
                key={answer.id}
                className="rounded-lg border border-slate-200 bg-white p-5"
              >
                <p className="text-xs text-slate-500">
                  {answer.author_email ?? "Anonymous"} · {formatDate(answer.created_at)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                  {answer.body}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <h2 className="mt-10 text-lg font-semibold text-slate-900">
          Add an answer
        </h2>
        {signedIn ? (
          <AnswerForm questionId={question.id} />
        ) : (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-700">
              Sign in to post an answer. You&apos;ll come right back to this
              question after signing in.
            </p>
            <div className="mt-3">
              <Link
                href={`/login?next=${encodeURIComponent(`/help/community/${question.id}`)}`}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Sign in to answer
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
