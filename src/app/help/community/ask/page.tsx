import Link from "next/link";
import { loadManifest } from "@/lib/tutorials";
import { createClient } from "@/lib/supabase/server";
import AskForm from "./AskForm";

export const metadata = {
  title: "Ask a question - Influencer Butler",
  description: "Post a question for the Influencer Butler community.",
};

export const dynamic = "force-dynamic";

type AuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string } | null };
      error: unknown;
    }>;
  };
};

async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = (await createClient()) as unknown as AuthClient;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch (err) {
    console.error("AskPage: getUser failed", err);
    return null;
  }
}

export default async function AskPage() {
  const [manifest, userId] = await Promise.all([loadManifest(), getCurrentUserId()]);
  const signedIn = userId !== null;

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

      <section className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Ask the community</h1>
        <p className="mt-2 text-slate-600">
          Sign in is required to post. Your question goes live on Community
          Q&amp;A right away.
        </p>

        {signedIn ? (
          <AskForm tutorials={manifest.tutorials} />
        ) : (
          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Sign in to post</h2>
            <p className="mt-2 text-sm text-slate-600">
              Posting a question requires an Influencer Butler account. Sign in
              and you&apos;ll come right back here.
            </p>
            <div className="mt-5">
              <Link
                href="/login?next=/help/community/ask"
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Sign in to continue
              </Link>
            </div>
          </div>
        )}

        <p className="mt-6 text-sm text-slate-500">
          You can also post questions directly from the desktop app: open{" "}
          <strong>Help &amp; Tutorials</strong> → <strong>Ask a question</strong>.
        </p>
      </section>
    </main>
  );
}
