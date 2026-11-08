// Links cancellation-survey EMAIL REPLIES to the Cancellations page.
//
// The emailed survey (src/lib/cancel-survey-email.ts) links to /cancel-survey,
// but it also says "just reply to this email". Many customers reply instead of
// clicking, and those replies land in the support queue (the feedback Worker)
// as "Re: Quick question: why did you cancel?" tickets. Nothing ever wrote them
// to subscription_cancel_reasons, so the Cancellations page showed every reason
// as unspecified.
//
// syncSurveyRepliesFromSupport() pulls those tickets, matches each reply to the
// customer's account by email, and records the reply text (plus a best-guess
// reason bucket) on their cancellation row. It only ever fills rows that have no
// answer yet (or creates one when none exists), so it is idempotent: running it
// on every admin page load is the backfill and the ongoing sync at once.

import { createAdminClient } from "@/lib/supabase/admin";
import { callSupportWorker, isSupportWorkerConfigured } from "@/lib/support-worker";
import type { Reason } from "@/lib/cancel-reasons-shared";

type SupportTicket = {
  id: string;
  title?: string | null;
  description?: string | null;
  userEmail?: string | null;
  submittedAt?: number | null;
};

const SURVEY_SUBJECT_RE = /why did you cancel/i;

/** Drops the quoted original message and signature noise from an email reply. */
export function cleanReplyText(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");
  const cutPatterns = [
    /\n[^\n]*On [^\n]{0,200}?(\n[^\n]{0,200}?)?wrote:/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\nFrom: [^\n]*\n/i,
    /\nSent from my /i,
  ];
  for (const re of cutPatterns) {
    const m = re.exec(text);
    if (m && m.index > 0) text = text.slice(0, m.index);
  }
  text = text
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, 2000);
}

/**
 * Best-guess reason bucket for a free-text reply. Deliberately conservative:
 * anything unclear is "other", and the admin always sees the full reply text.
 */
export function classifyReplyReason(text: string): Reason {
  const t = text.toLowerCase();
  if (/(too expensive|expensive|price|pricing|afford|cost|budget|money is tight)/.test(t)) {
    return "too_expensive";
  }
  if (/(not working|doesn'?t work|didn'?t work|stopped working|broken|bug|error|crash|glitch|fix(ed)?|lost (about )?a (month|week)|can'?t get it to)/.test(t)) {
    return "technical_issues";
  }
  if (/(missing|wish it|doesn'?t have|does not have|feature|would be nice if)/.test(t)) {
    return "missing_features";
  }
  if (/(switched to|another (tool|app|program|software)|found (a|an)|using .* instead|alternative)/.test(t)) {
    return "found_alternative";
  }
  if (/(not using|don'?t use|didn'?t use|haven'?t used|no time|too busy|not enough time|forgot)/.test(t)) {
    return "not_using";
  }
  if (/(just testing|just trying|trying it out|test(ing)? it|only wanted to try)/.test(t)) {
    return "just_testing";
  }
  return "other";
}

export type SurveyReplySyncResult = {
  ok: boolean;
  /** Survey reply tickets seen in the support queue. */
  replies: number;
  /** Rows filled or created this run. */
  recorded: number;
  /** Replies we could not match to an account by email. */
  unmatched: number;
  error?: string;
};

export async function syncSurveyRepliesFromSupport(): Promise<SurveyReplySyncResult> {
  const empty = { replies: 0, recorded: 0, unmatched: 0 };
  if (!isSupportWorkerConfigured()) return { ok: false, ...empty, error: "Support worker not configured" };

  const res = await callSupportWorker<{ tickets?: SupportTicket[] }>(
    `/agent/inbox?${new URLSearchParams({ q: "why did you cancel", limit: "200" }).toString()}`,
  );
  if (!res.ok) return { ok: false, ...empty, error: res.error };

  const replies = (res.data.tickets ?? []).filter(
    (t) => SURVEY_SUBJECT_RE.test(t.title ?? "") && /^\s*(re|aw|fw|fwd)\s*:/i.test(t.title ?? "") && t.userEmail,
  );
  if (replies.length === 0) return { ok: true, ...empty };

  // Oldest first. When one customer replied more than once, all of their
  // replies are joined into one answer (see below).
  replies.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));

  const supabase = createAdminClient();
  const emails = Array.from(new Set(replies.map((t) => (t.userEmail ?? "").trim().toLowerCase())));

  const userByEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100);
    const { data } = await supabase.from("profiles").select("id,email").in("email", batch);
    for (const p of data ?? []) {
      if (typeof p.id === "string" && typeof p.email === "string") {
        userByEmail.set(p.email.trim().toLowerCase(), p.id);
      }
    }
  }
  // profiles.email may be stored with different casing than the reply address.
  const missing = emails.filter((e) => !userByEmail.has(e));
  for (const e of missing) {
    const { data } = await supabase.from("profiles").select("id,email").ilike("email", e).limit(1);
    const p = data?.[0];
    if (p && typeof p.id === "string") userByEmail.set(e, p.id);
  }

  let recorded = 0;
  let unmatched = 0;
  const handledUsers = new Set<string>();

  for (const ticket of replies) {
    const email = (ticket.userEmail ?? "").trim().toLowerCase();
    const userId = userByEmail.get(email);
    if (!userId) {
      unmatched += 1;
      continue;
    }
    if (handledUsers.has(userId)) continue;
    handledUsers.add(userId);

    // Every reply this customer sent to the survey, oldest first.
    const texts = replies
      .filter((t) => (t.userEmail ?? "").trim().toLowerCase() === email)
      .map((t) => cleanReplyText(t.description ?? ""))
      .filter((s) => s.length > 0);
    if (texts.length === 0) continue;
    const feedback = `${texts.join("\n\n")}\n\n(Answered by email reply; ticket ${ticket.id})`.slice(0, 4000);
    const reason = classifyReplyReason(texts.join("\n"));
    const answeredAt = ticket.submittedAt
      ? new Date(ticket.submittedAt).toISOString()
      : new Date().toISOString();

    const { data: existing } = await supabase
      .from("subscription_cancel_reasons")
      .select("id,source,completed_at,reason,feedback")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const pending =
        (existing.source === "email" && !existing.completed_at) ||
        existing.reason === "unspecified";
      if (!pending) continue; // already has a real answer; never overwrite it
      const { error } = await supabase
        .from("subscription_cancel_reasons")
        .update({ reason, feedback, completed_at: answeredAt })
        .eq("id", existing.id);
      if (error) console.error("survey-reply sync: update failed", error);
      else recorded += 1;
      continue;
    }

    // No cancellation row at all (e.g. the webhook's pending insert failed):
    // attach the reply to their most recent ended paid subscription.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("ls_subscription_id")
      .eq("user_id", userId)
      .in("status", ["cancelled", "expired"])
      .not("ls_subscription_id", "like", "comp:%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("subscription_cancel_reasons").insert({
      user_id: userId,
      subscription_id: typeof sub?.ls_subscription_id === "string" ? sub.ls_subscription_id : null,
      reason,
      feedback,
      source: "email",
      completed_at: answeredAt,
      offer_shown: false,
      offer_accepted: false,
    });
    if (error) console.error("survey-reply sync: insert failed", error);
    else recorded += 1;
  }

  return { ok: true, replies: replies.length, recorded, unmatched };
}
