/**
 * Support auto-responder sweep.
 *
 * Pulls the "needs attention" pile from the feedback Worker, drafts a grounded
 * reply for each clear-cut ticket (grounded in the real tutorial index via
 * searchHelp), auto-sends only the safe how-to answers, and returns a report
 * the recap email renders. Bugs, anonymous auto-reports, and low-confidence or
 * ungrounded drafts are routed to the engineering autopilot (a scheduled local
 * Claude task that investigates, fixes, and replies): they get tagged
 * "autopilot-queue" and listed in the report's autopilotQueue bucket. Only
 * sensitive topics (refund/cancel/legal) and true dead ends land in "needs you"
 * for the owner.
 *
 * Safety posture: sends ONLY when SUPPORT_SWEEP_ENABLED === "true". With it
 * unset the sweep runs in shadow mode (drafts, never sends) so the owner can
 * watch the drafts before flipping the switch. Sends per run are capped by
 * SUPPORT_SWEEP_MAX_SENDS (default 10).
 *
 * Reuses: callSupportWorker (proxy), resolveTextProvider (Groq/OpenAI), and
 * searchHelp (tutorial grounding). No em dashes anywhere per repo style.
 */
import { callSupportWorker } from "@/lib/support-worker";
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";
import { searchHelp } from "@/lib/ai-concierge/agent";

const SITE = "https://www.influencerbutler.com";
const EM_DASH = String.fromCharCode(0x2014);

// A human reply this recent means the ticket is already handled; skip it.
const RECENT_REPLY_MS = 6 * 60 * 60 * 1000;

// Topics that must always go to a human, never an auto-reply.
const SENSITIVE_RE =
  /\b(refund|charge ?backs?|cancel(?:l?ing|l?ation|led)?|unsubscrib|lawsuit|legal|lawyer|attorney|gdpr|dispute|fraud|scam|angry|furious|terrible|awful|worst|sue you|delete my (?:data|account))\b/i;

// ---------------------------------------------------------------------------
// Ticket shapes (subset of the worker payload we use)
// ---------------------------------------------------------------------------

type WorkerReply = {
  direction?: "outbound" | "inbound";
  author?: string;
  subject?: string;
  body?: string;
  sentAt?: number | null;
};

export type WorkerTicket = {
  id: string;
  title?: string;
  description?: string;
  classification?: string | null;
  status?: string;
  priority?: string;
  userEmail?: string;
  licenseTier?: string;
  submittedAt?: number | null;
  lastTriagedAt?: number | null;
  repliedAt?: number | null;
  logTail?: string;
  tags?: string;
  replies?: WorkerReply[];
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function isSweepConfigured(): boolean {
  return !!process.env.SUPPORT_BOT_TOKEN;
}

function sendEnabled(): boolean {
  return process.env.SUPPORT_SWEEP_ENABLED === "true";
}

function maxSends(): number {
  const n = parseInt(process.env.SUPPORT_SWEEP_MAX_SENDS || "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function minConfidence(): number {
  const n = parseFloat(process.env.SUPPORT_SWEEP_MIN_CONFIDENCE || "0.75");
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.75;
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export type NeedsYouItem = {
  id: string;
  title: string;
  priority: string;
  status: string;
  classification: string | null;
  userEmail: string | null;
  ageHrs: number | null;
  reason: string;
  deepLink: string;
};

export type AutoSentItem = {
  id: string;
  title: string;
  userEmail: string;
  subject: string;
  body: string;
  deepLink: string;
};

export type DraftItem = {
  id: string;
  title: string;
  userEmail: string;
  subject: string;
  body: string;
  confidence: number;
  deepLink: string;
};

export type SweepReport = {
  ranAt: number;
  mode: "live" | "shadow" | "dry-run";
  swept: number;
  autoSent: AutoSentItem[];
  drafts: DraftItem[];
  needsYou: NeedsYouItem[];
  /** Bugs, anonymous auto-reports, and held drafts queued for the engineering autopilot. */
  autopilotQueue: NeedsYouItem[];
  openByStatus: Record<string, number>;
  oldestAgeHrs: number | null;
  errors: string[];
};

// ---------------------------------------------------------------------------
// Draft (shared with the "Suggest reply" admin route)
// ---------------------------------------------------------------------------

export type DraftResult = {
  action: "auto_answer" | "hold";
  confidence: number;
  classification: string;
  subject: string;
  body: string;
  reason: string;
  grounded: boolean;
};

function deepLink(id: string): string {
  return `${SITE}/dashboard/admin/support?ticket=${encodeURIComponent(id)}`;
}

function ageHrs(submittedAt: number | null | undefined): number | null {
  if (!submittedAt) return null;
  const hrs = (Date.now() - submittedAt) / 3_600_000;
  return hrs >= 0 ? Math.round(hrs * 10) / 10 : null;
}

function latestReply(t: WorkerTicket): WorkerReply | null {
  const replies = t.replies ?? [];
  if (replies.length === 0) return null;
  return replies.reduce((a, b) => ((b.sentAt ?? 0) >= (a.sentAt ?? 0) ? b : a));
}

const SYSTEM_PROMPT = [
  "You are a careful customer-support agent for Influencer Butler, a desktop app that helps",
  "creators post Amazon deals and manage affiliate content. You are drafting a reply to a support ticket.",
  "",
  "You are given the ticket and excerpts from the product's real help articles (the ONLY source of truth).",
  "Decide whether this ticket can be fully and safely answered right now from those excerpts.",
  "",
  "Return STRICT JSON with these keys:",
  '  action: "auto_answer" if a clear how-to/question is fully answered by the help excerpts; otherwise "hold".',
  "  confidence: number 0..1, how sure you are the reply resolves the ticket.",
  '  classification: one of "question", "bug", "feature", "spam", "other".',
  '  subject: a short reply subject (no "Re:" prefix needed).',
  "  body: the complete customer-ready reply, friendly and concise, signed 'Warmly,\\nYour Influencer Butler Team'.",
  "  reason: one short internal note (not shown to the customer) explaining your decision.",
  "",
  "Rules:",
  "- Choose action=hold for anything about bugs, crashes, refunds, cancellations, billing disputes, or angry customers.",
  "- Choose action=hold if the help excerpts do not actually contain the answer. Never invent steps, URLs, or settings.",
  "- Never use an em dash (the long dash). Use a colon, comma, or hyphen instead.",
  "- Keep the body under 250 words. Do not promise refunds, credits, or fixes.",
].join("\n");

async function callJson(system: string, user: string): Promise<Record<string, unknown> | null> {
  const providers = [resolveTextProvider(), openAiFallbackProvider()].filter(
    (p): p is NonNullable<typeof p> => !!p,
  );
  // De-dupe when Groq is absent and both resolve to the same OpenAI provider.
  const seen = new Set<string>();
  for (const provider of providers) {
    if (seen.has(provider.url)) continue;
    seen.add(provider.url);
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        console.error("[support-sweep] provider HTTP", provider.kind, res.status);
        continue;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) continue;
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      console.error("[support-sweep] provider threw", provider.kind, err);
    }
  }
  return null;
}

/**
 * Draft a grounded reply for one ticket. Returns null only when no LLM provider
 * is configured or every provider call failed. `grounded` reflects whether the
 * tutorial index actually matched the ticket.
 */
export async function draftReplyForTicket(t: WorkerTicket): Promise<DraftResult | null> {
  const query = `${t.title || ""} ${t.description || ""}`.slice(0, 400);
  const hits = await searchHelp(query);
  const grounded = hits.length > 0;
  const helpContext =
    hits
      .slice(0, 4)
      .map((h, i) => `[${i + 1}] ${h.title}: ${h.snippet} (${h.url})`)
      .join("\n") || "(no matching help articles)";
  const thread = (t.replies ?? [])
    .slice(-6)
    .map((r) => `${r.author || "?"}: ${(r.body || "").slice(0, 600)}`)
    .join("\n");

  const user = [
    `Ticket title: ${t.title || "(none)"}`,
    `Ticket body: ${(t.description || "").slice(0, 1500)}`,
    t.classification ? `Bot classification: ${t.classification}` : "",
    t.priority ? `Priority: ${t.priority}` : "",
    "",
    "Recent conversation (oldest first):",
    thread || "(no prior messages)",
    "",
    "Help article excerpts (source of truth):",
    helpContext,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callJson(SYSTEM_PROMPT, user);
  if (!raw) return null;

  const action = raw.action === "auto_answer" ? "auto_answer" : "hold";
  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : 0;
  const classification =
    typeof raw.classification === "string" ? raw.classification.toLowerCase().trim() : "other";
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";

  return { action, confidence, classification, subject, body, reason, grounded };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

async function sendAutoReply(t: WorkerTicket, draft: DraftResult): Promise<boolean> {
  const res = await callSupportWorker(`/agent/tickets/${encodeURIComponent(t.id)}/reply`, {
    method: "POST",
    body: {
      subject: (draft.subject || `Re: ${t.title || "your message"}`).slice(0, 200),
      body: draft.body.slice(0, 32000),
      author: "human-support",
      advanceStatus: "waiting_on_user",
    },
  });
  if (!res.ok) return false;

  // Best-effort marker so auto-handled tickets are distinguishable from human
  // replies. If the worker rejects the tag update the reply still stands.
  await tagTicket(t, "auto-answered");
  return true;
}

/** Best-effort: add a tag to a ticket without disturbing existing tags. */
async function tagTicket(t: WorkerTicket, tag: string): Promise<void> {
  const existing = (t.tags || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (existing.includes(tag)) return;
  const tagged = await callSupportWorker(`/agent/tickets/${encodeURIComponent(t.id)}/triage`, {
    method: "POST",
    body: { tags: [...existing, tag].join(", ") },
  });
  if (!tagged.ok) console.error("[support-sweep] tag update failed for", t.id, tagged.error);
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

function pushNeedsYou(
  report: SweepReport,
  t: WorkerTicket,
  age: number | null,
  reason: string,
): void {
  report.needsYou.push({
    id: t.id,
    title: t.title || "(no title)",
    priority: t.priority || "",
    status: t.status || "",
    classification: t.classification ?? null,
    userEmail: (t.userEmail || "").trim() || null,
    ageHrs: age,
    reason,
    deepLink: deepLink(t.id),
  });
}

/**
 * Route a ticket to the engineering autopilot: list it in the report and (when
 * mutations are allowed) tag it "autopilot-queue" so the scheduled autopilot
 * task can find it even between sweeps.
 */
async function pushAutopilot(
  report: SweepReport,
  t: WorkerTicket,
  age: number | null,
  reason: string,
  mutate: boolean,
): Promise<void> {
  report.autopilotQueue.push({
    id: t.id,
    title: t.title || "(no title)",
    priority: t.priority || "",
    status: t.status || "",
    classification: t.classification ?? null,
    userEmail: (t.userEmail || "").trim() || null,
    ageHrs: age,
    reason,
    deepLink: deepLink(t.id),
  });
  if (mutate) await tagTicket(t, "autopilot-queue");
}

function draftItem(t: WorkerTicket, draft: DraftResult): DraftItem {
  return {
    id: t.id,
    title: t.title || "(no title)",
    userEmail: (t.userEmail || "").trim(),
    subject: draft.subject,
    body: draft.body,
    confidence: draft.confidence,
    deepLink: deepLink(t.id),
  };
}

export async function runSupportSweep(opts?: { dryRun?: boolean }): Promise<SweepReport> {
  const dryRun = !!opts?.dryRun;
  const live = sendEnabled() && !dryRun;
  const report: SweepReport = {
    ranAt: Date.now(),
    mode: dryRun ? "dry-run" : live ? "live" : "shadow",
    swept: 0,
    autoSent: [],
    drafts: [],
    needsYou: [],
    autopilotQueue: [],
    openByStatus: {},
    oldestAgeHrs: null,
    errors: [],
  };

  const listRes = await callSupportWorker<{ tickets: WorkerTicket[] }>(
    "/agent/inbox?statuses=escalated,user_replied,waiting_on_user&limit=50",
  );
  if (!listRes.ok) {
    report.errors.push(`inbox: ${listRes.error}`);
    return report;
  }
  const tickets = listRes.data.tickets ?? [];
  report.swept = tickets.length;

  let sends = 0;
  for (const lite of tickets) {
    report.openByStatus[lite.status || "unknown"] =
      (report.openByStatus[lite.status || "unknown"] || 0) + 1;
    const age = ageHrs(lite.submittedAt);
    if (age != null) report.oldestAgeHrs = Math.max(report.oldestAgeHrs ?? 0, age);

    // The inbox list may be a lite row; fetch the full thread + logTail.
    let full = lite;
    const getRes = await callSupportWorker<{ ticket?: WorkerTicket } & WorkerTicket>(
      `/agent/tickets/${encodeURIComponent(lite.id)}`,
    );
    if (getRes.ok) {
      full = (getRes.data.ticket ?? (getRes.data as WorkerTicket)) || lite;
    }

    const email = (full.userEmail || "").trim();
    if (!email) {
      await pushAutopilot(
        report,
        full,
        age,
        "Anonymous auto-report, queued for the engineering autopilot",
        !dryRun,
      );
      continue;
    }

    const latest = latestReply(full);
    if (
      latest &&
      latest.author === "human-support" &&
      Date.now() - (latest.sentAt ?? 0) < RECENT_REPLY_MS
    ) {
      // Already answered recently; not waiting on us. Skip silently.
      continue;
    }

    if (SENSITIVE_RE.test(`${full.title || ""} ${full.description || ""}`)) {
      pushNeedsYou(report, full, age, "Sensitive topic (refund/cancel/legal), needs a human");
      continue;
    }

    let draft: DraftResult | null = null;
    try {
      draft = await draftReplyForTicket(full);
    } catch (err) {
      report.errors.push(`draft ${full.id}: ${err instanceof Error ? err.message : "error"}`);
    }
    if (!draft) {
      await pushAutopilot(
        report,
        full,
        age,
        "Could not draft a reply (AI unavailable), autopilot will pick it up",
        !dryRun,
      );
      continue;
    }

    const emDash = draft.body.includes(EM_DASH) || draft.subject.includes(EM_DASH);
    const canAuto =
      draft.action === "auto_answer" &&
      draft.grounded &&
      draft.classification === "question" &&
      draft.confidence >= minConfidence() &&
      !emDash &&
      draft.body.length > 0;

    if (!canAuto) {
      const why = emDash
        ? "Draft needed a style fix"
        : !draft.grounded
          ? "No matching help article"
          : draft.classification !== "question"
            ? `Looks like a ${draft.classification}`
            : draft.confidence < minConfidence()
              ? `Low confidence (${Math.round(draft.confidence * 100)}%)`
              : draft.reason || "Held";
      await pushAutopilot(report, full, age, `${why}, queued for the autopilot`, !dryRun);
      continue;
    }

    if (!live) {
      // Shadow / dry-run: surface the draft, never send.
      report.drafts.push(draftItem(full, draft));
      continue;
    }

    if (sends >= maxSends()) {
      // Cap reached: hold as a draft; the next sweep sends it. Not an owner item.
      report.drafts.push(draftItem(full, draft));
      continue;
    }

    const ok = await sendAutoReply(full, draft);
    if (ok) {
      sends += 1;
      report.autoSent.push({
        id: full.id,
        title: full.title || "(no title)",
        userEmail: email,
        subject: draft.subject,
        body: draft.body,
        deepLink: deepLink(full.id),
      });
    } else {
      report.errors.push(`send ${full.id} failed`);
      report.drafts.push(draftItem(full, draft));
      await pushAutopilot(report, full, age, "Auto-send failed, autopilot will retry", !dryRun);
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Sample data (design preview, no worker/LLM)
// ---------------------------------------------------------------------------

export function sampleSweepReport(): SweepReport {
  const id = (n: number) => `fb-00000000-0000-4000-8000-00000000000${n}`;
  return {
    ranAt: 1_700_000_000_000,
    mode: "shadow",
    swept: 6,
    autoSent: [
      {
        id: id(1),
        title: "How do I connect my Amazon account?",
        userEmail: "creator1@example.com",
        subject: "Connecting your Amazon account",
        body: "Hi,\n\nOpen Settings, then Connections, and click Connect Amazon. Sign in when the window opens and you are set.\n\nWarmly,\nYour Influencer Butler Team",
        deepLink: `${SITE}/dashboard/admin/support?ticket=${id(1)}`,
      },
    ],
    drafts: [
      {
        id: id(2),
        title: "Where do I change my posting schedule?",
        userEmail: "creator2@example.com",
        subject: "Changing your posting schedule",
        body: "Hi,\n\nYou can set posting times under Scheduling in the app. Pick your windows and save.\n\nWarmly,\nYour Influencer Butler Team",
        confidence: 0.82,
        deepLink: `${SITE}/dashboard/admin/support?ticket=${id(2)}`,
      },
    ],
    needsYou: [
      {
        id: id(4),
        title: "I want a refund for last month",
        priority: "P2",
        status: "escalated",
        classification: "question",
        userEmail: "creator4@example.com",
        ageHrs: 3.1,
        reason: "Sensitive topic (refund/cancel/legal), needs a human",
        deepLink: `${SITE}/dashboard/admin/support?ticket=${id(4)}`,
      },
    ],
    autopilotQueue: [
      {
        id: id(3),
        title: "App crashes when I open Deals",
        priority: "P1",
        status: "escalated",
        classification: "bug",
        userEmail: "creator3@example.com",
        ageHrs: 14.2,
        reason: "Looks like a bug, queued for the autopilot",
        deepLink: `${SITE}/dashboard/admin/support?ticket=${id(3)}`,
      },
    ],
    openByStatus: { escalated: 3, waiting_on_user: 2, user_replied: 1 },
    oldestAgeHrs: 42.5,
    errors: [],
  };
}
