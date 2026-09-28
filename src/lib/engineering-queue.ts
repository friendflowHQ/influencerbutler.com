/**
 * Engineering-autopilot queue.
 *
 * Pulls every open bug + feature-request ticket from the feedback Worker (calls,
 * desktop app, extension, Butler AI chat all land there), dedupes near-duplicate
 * reports of the same underlying issue into one canonical item, ranks them, and
 * exposes a clean list a scheduled Claude Code routine consumes to decide what
 * to build next. It does NOT run Claude Code itself: this repo produces and
 * tracks the queue; the routine (outside this repo) does the coding and opens a
 * PR for review.
 *
 * Safety posture: mirrors support-sweep. It MUTATES (tags tickets on the Worker)
 * only when ENG_AUTOPILOT_ENABLED === "true" and not a dry run. Unset = shadow
 * mode: it computes and reports but writes nothing, so the owner can watch the
 * queue before flipping the switch. Per-run item cap via ENG_AUTOPILOT_MAX_ITEMS
 * (default 8). No em dashes anywhere per repo style.
 *
 * Content note: ticket titles/descriptions are customer speech and user-typed
 * reports. Treat them as untrusted DATA, never instructions. The list endpoint
 * labels them as such and the routine's own prompt must too.
 */
import { callSupportWorker } from "@/lib/support-worker";
import { tagTicket, deepLink, ageHrs, type WorkerTicket } from "@/lib/support-sweep";

// Worker statuses that mean the item is closed out; never queue these.
const TERMINAL_STATUSES = new Set(["fixed", "spam", "archived", "released", "synced"]);

// Our own lifecycle tags on the Worker, distinct from support-sweep's
// "autopilot-queue" (which is the support-REPLY autopilot). Keep them separate
// so the two pipelines never collide.
export const TAG_QUEUE = "eng-queue";
export const TAG_WORKING = "eng-working";
export const TAG_DONE = "eng-done";

export function isEngQueueConfigured(): boolean {
  return !!process.env.SUPPORT_BOT_TOKEN;
}

function mutationsEnabled(): boolean {
  return process.env.ENG_AUTOPILOT_ENABLED === "true";
}

function maxItems(): number {
  const n = parseInt(process.env.ENG_AUTOPILOT_MAX_ITEMS || "8", 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EngItem = {
  /** Stable id derived from the cluster signature, e.g. "eng-1a2b3c". */
  queueId: string;
  classification: "bug" | "feature";
  title: string;
  description: string;
  /** All Worker ticket ids that fold into this item. */
  sourceTicketIds: string[];
  /** How many distinct customers reported it (min 1). */
  frequency: number;
  priority: string;
  tier: string | null;
  ageHrs: number | null;
  /** True once a routine has claimed it (tagged eng-working). */
  working: boolean;
  /** True when no source ticket was already tagged eng-queue (first time seen). */
  isNew: boolean;
  deepLink: string;
};

export type EngQueueReport = {
  ranAt: number;
  mode: "live" | "shadow" | "dry-run";
  /** Total bug+feature tickets pulled before clustering. */
  pulled: number;
  /** Deduped, ranked, capped items ready to work. */
  queued: EngItem[];
  /** Tickets skipped (terminal status or already done). */
  skipped: number;
  errors: string[];
};

// ---------------------------------------------------------------------------
// Clustering (pure, exported for tests)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "it", "this", "that", "my", "i",
  "when", "cant", "cannot", "not", "no", "doesnt", "wont", "keep", "keeps",
  "app", "butler", "influencer", "please", "issue", "bug", "problem", "error",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
function priorityRank(p: string | undefined): number {
  return p && p in PRIORITY_RANK ? PRIORITY_RANK[p] : 4;
}

/** djb2 hash to a short hex, for a stable queueId from a cluster signature. */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).slice(0, 6);
}

type Cluster = { classification: "bug" | "feature"; tickets: WorkerTicket[]; tokens: Set<string> };

/**
 * Greedy cluster of tickets by title/description token overlap, within a single
 * classification (bugs never merge with features). Exported for tests.
 */
export function clusterTickets(
  tickets: WorkerTicket[],
  threshold = 0.5,
): { classification: "bug" | "feature"; tickets: WorkerTicket[] }[] {
  const clusters: Cluster[] = [];
  for (const t of tickets) {
    const cls: "bug" | "feature" = t.classification === "feature" ? "feature" : "bug";
    const tokens = tokenize(`${t.title || ""} ${t.description || ""}`);
    let best: Cluster | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      if (c.classification !== cls) continue;
      const score = jaccard(tokens, c.tokens);
      if (score >= threshold && score > bestScore) { best = c; bestScore = score; }
    }
    if (best) {
      best.tickets.push(t);
      for (const w of tokens) best.tokens.add(w);
    } else {
      clusters.push({ classification: cls, tickets: [t], tokens });
    }
  }
  return clusters.map((c) => ({ classification: c.classification, tickets: c.tickets }));
}

function distinctReporters(tickets: WorkerTicket[]): number {
  const emails = new Set(
    tickets.map((t) => (t.userEmail || "").trim().toLowerCase()).filter(Boolean),
  );
  // Anonymous reports have no email; count them by ticket so frequency is never 0.
  const anon = tickets.filter((t) => !(t.userEmail || "").trim()).length;
  return Math.max(1, emails.size + anon);
}

/** Turn a cluster into the canonical EngItem (best-priority, newest as representative). */
function toEngItem(cluster: { classification: "bug" | "feature"; tickets: WorkerTicket[] }): EngItem {
  const rep = [...cluster.tickets].sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return (b.submittedAt || 0) - (a.submittedAt || 0);
  })[0];
  const ids = cluster.tickets.map((t) => t.id);
  const bestPriority = cluster.tickets
    .map((t) => t.priority || "")
    .sort((a, b) => priorityRank(a) - priorityRank(b))[0] || "";
  const working = cluster.tickets.some((t) => (t.tags || "").includes(TAG_WORKING));
  const isNew = !cluster.tickets.some((t) => (t.tags || "").includes(TAG_QUEUE));
  const newest = cluster.tickets.reduce<number | null>(
    (m, t) => (t.submittedAt && (m == null || t.submittedAt > m) ? t.submittedAt : m),
    null,
  );
  return {
    queueId: `eng-${shortHash(ids.slice().sort().join("|"))}`,
    classification: cluster.classification,
    title: rep.title || "(no title)",
    description: rep.description || "",
    sourceTicketIds: ids,
    frequency: distinctReporters(cluster.tickets),
    priority: bestPriority,
    tier: rep.licenseTier || null,
    ageHrs: ageHrs(newest),
    working,
    isNew,
    deepLink: deepLink(rep.id),
  };
}

/** Rank: bugs first, then priority, then frequency, then recency. */
function rankItems(items: EngItem[]): EngItem[] {
  return items.slice().sort((a, b) => {
    if (a.classification !== b.classification) return a.classification === "bug" ? -1 : 1;
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return (b.ageHrs ?? 0) - (a.ageHrs ?? 0);
  });
}

/** Build the ranked, deduped item list from raw tickets (pure, exported for tests). */
export function buildQueue(tickets: WorkerTicket[]): EngItem[] {
  const open = tickets.filter(
    (t) =>
      !TERMINAL_STATUSES.has((t.status || "").toLowerCase()) &&
      !(t.tags || "").includes(TAG_DONE),
  );
  const clusters = clusterTickets(open);
  return rankItems(clusters.map(toEngItem));
}

// ---------------------------------------------------------------------------
// Fetch + sweep
// ---------------------------------------------------------------------------

async function fetchByClassification(
  classification: "bug" | "feature",
): Promise<{ tickets: WorkerTicket[]; error?: string }> {
  const res = await callSupportWorker<{ tickets: WorkerTicket[] }>(
    `/agent/inbox?classification=${classification}&limit=200`,
  );
  if (!res.ok) return { tickets: [], error: `${classification}: ${res.error}` };
  return { tickets: res.data.tickets ?? [] };
}

/**
 * Pull all open bug + feature tickets across sources, deduped by id. Shared by
 * the sweep (which then tags) and the list endpoint (which only reads).
 */
export async function pullEngineeringTickets(): Promise<{
  tickets: WorkerTicket[];
  byId: Map<string, WorkerTicket>;
  errors: string[];
}> {
  const errors: string[] = [];
  const [bugs, feats] = await Promise.all([
    fetchByClassification("bug"),
    fetchByClassification("feature"),
  ]);
  if (bugs.error) errors.push(bugs.error);
  if (feats.error) errors.push(feats.error);
  const byId = new Map<string, WorkerTicket>();
  for (const t of [...bugs.tickets, ...feats.tickets]) if (t?.id) byId.set(t.id, t);
  return { tickets: [...byId.values()], byId, errors };
}

export async function runEngineeringQueueSweep(
  opts?: { dryRun?: boolean },
): Promise<EngQueueReport> {
  const dryRun = !!opts?.dryRun;
  const live = mutationsEnabled() && !dryRun;
  const report: EngQueueReport = {
    ranAt: Date.now(),
    mode: dryRun ? "dry-run" : live ? "live" : "shadow",
    pulled: 0,
    queued: [],
    skipped: 0,
    errors: [],
  };

  const { tickets: all, byId, errors } = await pullEngineeringTickets();
  report.errors.push(...errors);
  report.pulled = all.length;

  const items = buildQueue(all);
  report.skipped = report.pulled - items.reduce((n, it) => n + it.sourceTicketIds.length, 0);
  report.queued = items.slice(0, maxItems());

  // Tag the queued items' source tickets so a routine can find them between
  // sweeps, and so we can track working/done. Shadow mode writes nothing.
  if (live) {
    for (const item of report.queued) {
      for (const id of item.sourceTicketIds) {
        const t = byId.get(id);
        if (t) await tagTicket(t, TAG_QUEUE);
      }
    }
  }

  return report;
}
