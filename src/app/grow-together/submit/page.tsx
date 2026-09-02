import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBundleSubmitToken } from "@/lib/grow-together-submit";
import { BUNDLE_SLUG, BUNDLE_NAME, topicBySlug } from "../_data/bundleMeta";
import SubmissionForm, { type SubmissionInitial } from "./_components/SubmissionForm";

export const metadata: Metadata = {
  title: `${BUNDLE_NAME}: submit your chapter`,
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">{children}</main>
      <SiteFooter />
    </div>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
      <h1 className="text-xl font-bold text-amber-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-amber-800">{body}</p>
    </div>
  );
}

type ContribRow = {
  name: string | null;
  email: string | null;
  instagram_handle: string | null;
  website: string | null;
  topic: string | null;
  chapter_title: string | null;
  handles_to_include: string | null;
  intro_earn: string | null;
  intro_inspired: string | null;
  intro_love: string | null;
  chapter_body: string | null;
  conclude_question: string | null;
  conclude_answer: string | null;
  cta_text: string | null;
  headshot_url: string | null;
  status: string | null;
};

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t } = await searchParams;
  const email = (e ?? "").trim().toLowerCase();
  const token = t ?? "";

  if (!email || !token || !verifyBundleSubmitToken(email, token)) {
    return (
      <Shell>
        <ErrorCard
          title="This submission link is not valid"
          body="Please use the exact link from the email we sent you. If you are stuck, just reply to that email and we will help."
        />
      </Shell>
    );
  }

  // Load the contributor to prefill the form. Missing table / no row -> friendly.
  let row: ContribRow | null = null;
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("bundle_contributors")
      .select(
        "name, email, instagram_handle, website, topic, chapter_title, handles_to_include, intro_earn, intro_inspired, intro_love, chapter_body, conclude_question, conclude_answer, cta_text, headshot_url, status",
      )
      .eq("bundle_slug", BUNDLE_SLUG)
      .ilike("email", email)
      .maybeSingle();
    row = (data as ContribRow | null) ?? null;
  } catch {
    row = null;
  }

  if (!row) {
    return (
      <Shell>
        <ErrorCard
          title="We could not find your application"
          body="Please apply to contribute first, then use the submission link we email you."
        />
      </Shell>
    );
  }

  const topic = topicBySlug(row.topic ?? "");
  const initial: SubmissionInitial = {
    email,
    token,
    name: row.name ?? "",
    instagramHandle: row.instagram_handle ?? "",
    website: row.website ?? "",
    topicTitle: topic?.title ?? row.topic ?? "your topic",
    chapterTitle: row.chapter_title ?? "",
    handlesToInclude: row.handles_to_include ?? row.instagram_handle ?? "",
    introEarn: row.intro_earn ?? "",
    introInspired: row.intro_inspired ?? "",
    introLove: row.intro_love ?? "",
    chapterBody: row.chapter_body ?? "",
    concludeQuestion: row.conclude_question ?? "",
    concludeAnswer: row.conclude_answer ?? "",
    ctaText: row.cta_text ?? "",
    headshotUrl: row.headshot_url ?? "",
    alreadySubmitted: row.status === "submitted" || row.status === "scheduled" || row.status === "done",
  };

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Submit your chapter</h1>
        <p className="mt-2 text-slate-600">
          For the <strong>{BUNDLE_NAME}</strong>. Your topic:{" "}
          <span className="font-semibold text-orange-700">{initial.topicTitle}</span>. Fill this in as
          much or as little as you like. You can come back and edit any time before the deadline.
        </p>
      </div>
      <SubmissionForm initial={initial} />
    </Shell>
  );
}
