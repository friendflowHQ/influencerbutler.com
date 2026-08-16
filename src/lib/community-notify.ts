/**
 * Shared helpers for community answer replies + notification emails, used by
 * both the public answer route (/api/help/questions/[id]/answers) and the
 * admin auto-responder route (/api/admin/community/respond) so the two post
 * paths validate parents and send identical emails.
 *
 * Notifications go through sendMarketingEmail deliberately: these are
 * engagement nudges, not required-for-service mail, so they honor the
 * email_suppressions opt-out list and carry unsubscribe headers. A user who
 * unsubscribed from marketing silently gets no community notifications.
 */
import { createAdminClient } from "@/lib/admin";
import { sendMarketingEmail } from "@/lib/marketing-email";

const SITE_URL = "https://www.influencerbutler.com";
const FROM = "Influencer Butler <hello@influencerbutler.com>";
const EXCERPT_MAX = 300;

export type ParentAnswerRow = {
  id: string;
  question_id: string;
  parent_answer_id: string | null;
  author_id: string | null;
  author_email: string | null;
  status: string;
};

type ParentLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: ParentAnswerRow | null;
          error: unknown;
        }>;
      };
    };
  };
};

export type ResolveParentResult =
  | { ok: true; referenced: ParentAnswerRow; storageParentId: string }
  | { ok: false; error: string };

/**
 * Validates a reply target: the referenced answer must exist, belong to the
 * question, and be approved. Returns the row actually referenced (its author
 * is who gets the "replied to you" email) plus the id to store as the parent.
 * Depth is capped at one level: replying to a reply is coerced onto that
 * reply's thread root rather than rejected.
 */
export async function resolveParentAnswer(
  questionId: string,
  parentAnswerId: string,
): Promise<ResolveParentResult> {
  const admin = createAdminClient() as unknown as ParentLookupClient | null;
  if (!admin) return { ok: false, error: "Server misconfigured" };

  const { data: referenced, error } = await admin
    .from("community_answers")
    .select("id, question_id, parent_answer_id, author_id, author_email, status")
    .eq("id", parentAnswerId)
    .maybeSingle();

  if (error) {
    console.error("resolveParentAnswer: lookup failed", error);
    return { ok: false, error: "Could not load the answer you replied to." };
  }
  if (
    !referenced ||
    referenced.question_id !== questionId ||
    referenced.status !== "approved"
  ) {
    return { ok: false, error: "The answer you replied to no longer exists." };
  }

  return {
    ok: true,
    referenced,
    storageParentId: referenced.parent_answer_id ?? referenced.id,
  };
}

export type QuestionForNotify = {
  id: string;
  title: string;
  author_id: string | null;
  author_email: string | null;
};

type QuestionLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: QuestionForNotify | null;
          error: unknown;
        }>;
      };
    };
  };
};

/** Loads the fields notifyCommunityAnswer needs from the question row. */
export async function loadQuestionForNotify(
  questionId: string,
): Promise<QuestionForNotify | null> {
  const admin = createAdminClient() as unknown as QuestionLookupClient | null;
  if (!admin) return null;
  const { data, error } = await admin
    .from("community_questions")
    .select("id, title, author_id, author_email")
    .eq("id", questionId)
    .maybeSingle();
  if (error) {
    console.error("loadQuestionForNotify failed", error);
    return null;
  }
  return data;
}

function excerpt(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= EXCERPT_MAX) return trimmed;
  return `${trimmed.slice(0, EXCERPT_MAX)}...`;
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type NotifyParams = {
  questionId: string;
  questionTitle: string;
  questionAuthorEmail: string | null;
  posterEmail: string | null;
  posterName: string;
  answerBody: string;
  /** Set when this answer is a reply: the author of the answer replied to. */
  repliedToEmail?: string | null;
};

/**
 * Sends the notification fan-out for a new answer/reply:
 *  - reply -> the replied-to answer's author ("new reply to your answer")
 *  - any answer -> the question author ("your question got a new answer")
 * Skips the poster (no self-notifications), dedupes recipients
 * case-insensitively, and skips null/empty addresses. Best-effort: failures
 * log and never throw. Returns the addresses actually attempted.
 */
export async function notifyCommunityAnswer(params: NotifyParams): Promise<string[]> {
  const url = `${SITE_URL}/help/community/${params.questionId}`;
  const quote = excerpt(params.answerBody);
  const poster = params.posterName || "A community member";
  const notified: string[] = [];

  const sends: Array<{ to: string; subject: string; text: string }> = [];

  if (
    params.repliedToEmail &&
    !sameEmail(params.repliedToEmail, params.posterEmail)
  ) {
    sends.push({
      to: params.repliedToEmail,
      subject: `New reply to your answer on "${params.questionTitle}"`,
      text: [
        "Hi,",
        "",
        `${poster} replied to your answer on "${params.questionTitle}" in the Influencer Butler community:`,
        "",
        `"${quote}"`,
        "",
        "Read the full thread and respond here:",
        url,
        "",
        "Thanks for helping out in the community!",
        "Influencer Butler",
      ].join("\n"),
    });
  }

  if (
    params.questionAuthorEmail &&
    !sameEmail(params.questionAuthorEmail, params.posterEmail) &&
    !sends.some((s) => sameEmail(s.to, params.questionAuthorEmail))
  ) {
    sends.push({
      to: params.questionAuthorEmail,
      subject: `Your question got a new answer: "${params.questionTitle}"`,
      text: [
        "Hi,",
        "",
        `${poster} answered your question "${params.questionTitle}" in the Influencer Butler community:`,
        "",
        `"${quote}"`,
        "",
        "Read the answer and reply here:",
        url,
        "",
        "Thanks for being part of the community!",
        "Influencer Butler",
      ].join("\n"),
    });
  }

  for (const send of sends) {
    try {
      const handled = await sendMarketingEmail({
        from: FROM,
        to: send.to,
        subject: send.subject,
        text: send.text,
        category: "community_notify",
      });
      if (handled) notified.push(send.to);
    } catch (err) {
      console.error("notifyCommunityAnswer send failed", err, { to: send.to });
    }
  }

  return notified;
}
