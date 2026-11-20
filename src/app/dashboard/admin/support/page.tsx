"use client";

/**
 * Admin Support dashboard — the human take-over surface for the feedback/bug/
 * feature-request ticket queue. The support-bot triages automatically; this is
 * where the owner watches it, jumps on escalations, and replies by hand.
 * Reads via same-origin /api/admin/support/* (which proxy the feedback Worker's
 * bearer-gated /agent/* routes). Gated by the support.view / support.respond
 * permissions server-side; a 403 renders the "Admin only" state.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

type Attachment = {
  id: number | string;
  filename: string;
  contentType: string;
  size: number | null;
  isInline: boolean;
  contentId: string | null;
};

type Reply = {
  id: number | string;
  direction: "outbound" | "inbound";
  author: "bot" | "user" | "human-support";
  subject: string;
  body: string;
  sentAt: number | null;
  attachments?: Attachment[];
};

type Ticket = {
  id: string;
  type: string;
  classification: string | null;
  title: string;
  description: string;
  userEmail: string;
  licenseTier: string;
  appVersion: string;
  platform: string;
  status: string;
  priority: string;
  tags: string;
  escalatedReason: string | null;
  agentNotes: string;
  githubIssueUrl: string | null;
  fixCommitSha: string | null;
  resolvedVersion: string | null;
  resolvedAt: number | null;
  submittedAt: number | null;
  lastTriagedAt: number | null;
  repliedAt: number | null;
  logTail?: string;
  replies?: Reply[];
  // Real customer when the ticket was auto-filed under the owner address
  // (call / Concierge sessions). Replies go here, not to userEmail.
  requesterEmail?: string;
  // Human-side data from Supabase (assignee, notes, bot draft), attached by the list route.
  assignee?: string;
  noteCount?: number;
  draftId?: string | null;
  // Attachments that arrived on the email that OPENED the ticket (inbound
  // screenshots / files); per-reply attachments live on each Reply instead.
  attachments?: Attachment[];
};

const REPO_URL = "https://github.com/friendflowHQ/InfluencerButler";

// Reply attachments / pasted images. These travel as base64 in the reply POST,
// so the caps here mirror the server route (which re-validates): the JSON body
// must stay under Vercel's ~4.5 MB request limit, and base64 inflates bytes by
// ~33%, so 3 MB of raw files is the practical ceiling.
type ReplyMedia = { id: string; filename: string; contentType: string; b64: string; size: number };
const MAX_ATTACHMENTS = 5;
const MAX_INLINE_IMAGES = 5;
const MAX_ITEM_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 3 * 1024 * 1024;

function readFileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

type Bucket = { key: string; label: string; statuses: string[] };

const BUCKETS: Bucket[] = [
  // "Needs me" is only what a human must act on. Tickets the bot is waiting on
  // the customer for live in their own tab so they stop burying real work.
  { key: "needsMe", label: "Needs me", statuses: ["escalated", "user_replied"] },
  { key: "waiting", label: "Waiting on customer", statuses: ["waiting_on_user"] },
  // Special tab: drafts the sweep wrote but did not send. Loaded from /drafts.
  { key: "drafts", label: "Bot drafts", statuses: [] },
  { key: "new", label: "New", statuses: ["sent"] },
  { key: "inProgress", label: "In progress", statuses: ["acked", "clarifying", "patching", "committed", "released"] },
  { key: "resolved", label: "Resolved", statuses: ["fixed"] },
  { key: "spam", label: "Spam", statuses: ["spam"] },
  { key: "archived", label: "Archived", statuses: ["archived"] },
  { key: "all", label: "All", statuses: [] },
];

const PRIORITIES = ["", "P0", "P1", "P2", "P3"];

const PAGE_SIZE = 100;

const SORTS = [
  { key: "auto", label: "Smart order" },
  { key: "oldest", label: "Waiting longest" },
  { key: "newest", label: "Newest activity" },
  { key: "priority", label: "Priority" },
] as const;

const TIME_RANGES = [
  { key: "", label: "Any time", ms: 0 },
  { key: "1d", label: "Last 24 hours", ms: 24 * 3600 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 3600 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 3600 * 1000 },
] as const;

const KNOWN_TIERS = ["solo", "growth", "pro", "team", "agency", "free", "trial"];

const VIEWS_KEY = "ib-support-saved-views";

type SavedView = {
  name: string;
  bucket: string;
  priority: string;
  tier: string;
  type: string;
  platform: string;
  version: string;
  tag: string;
  range: string;
  sort: string;
};

function loadViews(): SavedView[] {
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedView[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeViews(views: SavedView[]) {
  try { window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* private mode */ }
}

// "fb-3f905396-0533-..." -> "fb-3f905396". Full id stays in the tooltip/drawer.
function shortId(id: string): string {
  const m = /^(fb|tf-crash|tf-screenshot)-([0-9a-z]+)/i.exec(id);
  return m ? `${m[1]}-${m[2].slice(0, 8)}` : id.slice(0, 14);
}

// Most recent thing that happened on the ticket (customer or us).
function lastActivity(t: Ticket): number {
  return Math.max(Number(t.repliedAt || 0), Number(t.submittedAt || 0));
}

function ticketTags(t: Ticket): string[] {
  return (t.tags || "").split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

// A short "who has the ball" chip, derived from status + the tags the bots set.
function botState(t: Ticket): { label: string; tone: string } | null {
  const tags = ticketTags(t);
  if (tags.includes("human-owned")) return { label: "you own this", tone: "bg-indigo-50 text-indigo-700" };
  if (t.status === "escalated") return { label: "needs you", tone: "bg-rose-50 text-rose-700" };
  if (t.status === "user_replied") return { label: "customer replied", tone: "bg-amber-50 text-amber-700" };
  if (tags.includes("auto-answered")) return { label: "auto-answered", tone: "bg-violet-50 text-violet-700" };
  if (tags.includes("autopilot-queue")) return { label: "bot queued", tone: "bg-slate-100 text-slate-600" };
  if (tags.includes("awaiting-fix")) return { label: "awaiting fix", tone: "bg-sky-50 text-sky-700" };
  if (tags.some((x) => x.startsWith("eng-"))) return { label: "engineering", tone: "bg-sky-50 text-sky-700" };
  if (t.status === "waiting_on_user") return { label: "bot asked customer", tone: "bg-slate-100 text-slate-600" };
  return null;
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Split a reply body into the new text and the quoted history ("> ..." lines or
// an "On <date> ... wrote:" header onward) so long threads stay readable.
function splitQuoted(body: string): { fresh: string; quoted: string } {
  const lines = (body || "").split("\n");
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^on .{5,120} wrote:?$/i.test(l) || /^-{2,}\s*original message\s*-{2,}$/i.test(l) || (l.startsWith(">") && i > 0)) {
      cut = i;
      break;
    }
  }
  if (cut <= 0) return { fresh: body || "", quoted: "" };
  return { fresh: lines.slice(0, cut).join("\n").trimEnd(), quoted: lines.slice(cut).join("\n") };
}

// Turn bare http(s) URLs into links (text stays escaped by React).
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-orange-700 underline">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

type Health = {
  sweep: { mode: "live" | "shadow"; minConfidence: number; maxSendsPerRun: number };
  engineeringAutopilot: "live" | "shadow";
  lastBotAt: number | null;
  stale: boolean;
  expectedCadence: string;
  autoAnswered24h: number;
  needsMeCount: number;
  oldestNeedsMeAt: number | null;
  autoClose: { waitingOnUserDays: number; noReplyDays: number };
};

type TicketNote = { id: string; authorEmail: string; body: string; createdAt: string };

type BotDraft = {
  id: string;
  ticketId: string;
  title: string;
  customerEmail: string;
  priority: string;
  subject: string;
  body: string;
  confidence: number | null;
  grounded: boolean;
  classification: string;
  reason: string;
  createdAt: string;
};

type SuggestMeta = { confidence: number | null; grounded: boolean; action: string; reason: string };

const STATUS_OPTIONS = [
  "sent", "acked", "clarifying", "waiting_on_user", "user_replied",
  "patching", "committed", "released", "fixed", "escalated", "spam", "archived",
];

function priorityClasses(p: string): string {
  switch (p) {
    case "P0": return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
    case "P1": return "bg-orange-100 text-[#c2410c] ring-1 ring-orange-200";
    case "P2": return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    default: return "bg-slate-50 text-slate-500 ring-1 ring-slate-200";
  }
}

function statusClasses(s: string): string {
  if (s === "escalated") return "bg-rose-50 text-rose-700";
  if (s === "user_replied" || s === "waiting_on_user") return "bg-amber-50 text-amber-700";
  if (s === "fixed") return "bg-emerald-50 text-emerald-700";
  if (s === "spam" || s === "archived") return "bg-slate-100 text-slate-500";
  return "bg-sky-50 text-sky-700";
}

// Compose the ticket lifecycle into ordered timeline steps for the drawer.
type Step = { label: string; at: number | null; detail?: ReactNode; done: boolean };

function buildTimeline(t: Ticket): Step[] {
  const replies = t.replies ?? [];
  const firstOutbound = replies.find((r) => r.direction === "outbound") || null;
  const shipNotice = replies.find(
    (r) => r.direction === "outbound" && /fixed in v/i.test(r.subject || ""),
  ) || null;
  const steps: Step[] = [
    { label: "Submitted", at: t.submittedAt, done: true },
    {
      label: "Acknowledged",
      at: firstOutbound?.sentAt ?? null,
      detail: firstOutbound ? `by ${firstOutbound.author}` : "no reply yet",
      done: !!firstOutbound,
    },
    {
      label: "Bot triaged",
      at: t.lastTriagedAt,
      detail: t.classification ? `classified ${t.classification} · ${t.priority}` : undefined,
      done: !!t.lastTriagedAt,
    },
  ];
  if (t.fixCommitSha) {
    steps.push({
      label: "Fix committed",
      at: null,
      detail: (
        <a className="text-[#f97316] hover:underline" href={`${REPO_URL}/commit/${t.fixCommitSha}`} target="_blank" rel="noreferrer">
          {t.fixCommitSha.slice(0, 10)} on main ↗
        </a>
      ),
      done: true,
    });
  }
  steps.push({
    label: t.resolvedVersion ? `Shipped in v${String(t.resolvedVersion).replace(/^v/i, "")}` : "Shipped in a release",
    at: t.resolvedAt,
    detail: t.resolvedVersion ? undefined : "not yet released",
    done: !!t.resolvedVersion,
  });
  steps.push({
    label: "Customer notified it shipped",
    at: shipNotice?.sentAt ?? null,
    detail: shipNotice ? undefined : "pending release",
    done: !!shipNotice,
  });
  return steps;
}

// One-line release/handling state for the drawer banner.
function releaseState(t: Ticket): { text: string; tone: string } {
  if (t.status === "escalated") return { text: "Escalated to you — the bot handed this back", tone: "bg-rose-50 text-rose-700" };
  if (t.resolvedVersion) return { text: `Shipped in v${String(t.resolvedVersion).replace(/^v/i, "")}`, tone: "bg-emerald-50 text-emerald-700" };
  if (t.fixCommitSha) return { text: "Fix committed to main — awaiting the next release", tone: "bg-sky-50 text-sky-700" };
  if (t.status === "spam") return { text: "Marked spam", tone: "bg-slate-100 text-slate-500" };
  if (t.status === "archived") return { text: "Archived", tone: "bg-slate-100 text-slate-500" };
  if (["acked", "clarifying", "patching", "committed", "released"].includes(t.status)) return { text: "In progress", tone: "bg-sky-50 text-sky-700" };
  return { text: "New — not yet worked", tone: "bg-slate-100 text-slate-600" };
}

function ago(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - Number(ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fullTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  try { return new Date(Number(ms)).toLocaleString("en-US"); } catch { return String(ms); }
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentSrc(a: Attachment): string {
  return `/api/admin/support/attachment?id=${encodeURIComponent(String(a.id))}`;
}

function isImageAttachment(a: Attachment): boolean {
  return a.isInline || (a.contentType || "").startsWith("image/");
}

// Render inbound-email attachments: inline images as a thumbnail grid (click to
// open full size), everything else as a labeled download chip. Bytes stream
// from the private R2 bucket through the same-origin, permission-gated proxy.
function AttachmentGallery({ items }: { items: Attachment[] | undefined }) {
  const list = items ?? [];
  if (list.length === 0) return null;
  const images = list.filter(isImageAttachment);
  const files = list.filter((a) => !isImageAttachment(a));
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={attachmentSrc(a)}
              target="_blank"
              rel="noreferrer"
              title={`${a.filename}${a.size ? ` · ${formatBytes(a.size)}` : ""}`}
              className="block overflow-hidden rounded-lg border border-slate-200 hover:border-[#f97316]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachmentSrc(a)} alt={a.filename} className="max-h-48 w-auto object-contain" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => (
            <a
              key={a.id}
              href={attachmentSrc(a)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-[#f97316] hover:text-[#f97316]"
            >
              <span aria-hidden>📎</span>
              <span className="max-w-[16rem] truncate">{a.filename}</span>
              {a.size ? <span className="text-slate-400">{formatBytes(a.size)}</span> : null}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SupportAdminPage() {
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const [bucket, setBucket] = useState<string>("needsMe");
  const [priority, setPriority] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [versionFilter, setVersionFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [range, setRange] = useState<string>("");
  const [sort, setSort] = useState<string>("auto");
  const [limit, setLimit] = useState<number>(PAGE_SIZE);
  const [views, setViews] = useState<SavedView[]>([]);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [myEmail, setMyEmail] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [metaPending, setMetaPending] = useState(false);
  const [draftRows, setDraftRows] = useState<BotDraft[]>([]);
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const [activeDraft, setActiveDraft] = useState<BotDraft | null>(null);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [suggestMeta, setSuggestMeta] = useState<SuggestMeta | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  // qInput is what is typed; q is the applied search (debounced, or on Enter).
  const [qInput, setQInput] = useState<string>("");
  const [q, setQ] = useState<string>("");
  // Guards against a slow, older list response overwriting a newer one.
  const listSeq = useRef(0);

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  // Per-user history drawer: every ticket this email has ever submitted.
  const [userView, setUserView] = useState<{ email: string; tickets: Ticket[]; loading: boolean; error: string | null } | null>(null);
  const [actionMsg, setActionMsg] = useState<string>("");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  // Move the ticket out of the needs-attention buckets once a human has answered.
  const [replyAdvance, setReplyAdvance] = useState(true);
  // AI "Suggest reply": drafts a grounded reply into the box (never auto-sends).
  const [suggesting, setSuggesting] = useState(false);
  const [suggestReason, setSuggestReason] = useState("");
  const [editPriority, setEditPriority] = useState("P2");
  const [editTags, setEditTags] = useState("");
  // Reply media: files attach as downloads; pasted images embed inline (cid:).
  const [replyAttachments, setReplyAttachments] = useState<ReplyMedia[]>([]);
  const [replyInlineImages, setReplyInlineImages] = useState<ReplyMedia[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeBucket = useMemo(() => BUCKETS.find((b) => b.key === bucket) ?? BUCKETS[0], [bucket]);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support/counts", { cache: "no-store" });
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) return;
      const json = (await res.json()) as { counts?: Record<string, number> };
      setCounts(json.counts ?? {});
    } catch { /* tile row just won't render */ }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support/drafts", { cache: "no-store" });
      if (res.status === 403) { setForbidden(true); return; }
      const json = (await res.json()) as { drafts?: BotDraft[]; migrationPending?: boolean; error?: string };
      if (!res.ok) { setError(json.error || "Failed to load drafts"); return; }
      setDraftRows(json.drafts ?? []);
      setDraftCount((json.drafts ?? []).length);
      if (json.migrationPending) setMetaPending(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load drafts");
    }
  }, []);

  const fetchList = useCallback(async () => {
    const seq = ++listSeq.current;
    setLoading(true);
    setError(null);
    if (activeBucket.key === "drafts" && !q.trim()) {
      await loadDrafts();
      if (seq === listSeq.current) { setTickets([]); setLoading(false); }
      return;
    }
    try {
      const qs = new URLSearchParams();
      // A search looks across every status: the ticket you are hunting for by
      // ID or email is often already answered, so it is not in the
      // "needs attention" tab the page opens on.
      if (activeBucket.statuses.length && !q.trim()) qs.set("statuses", activeBucket.statuses.join(","));
      if (priority) qs.set("priority", priority);
      if (tier.trim()) qs.set("tier", tier.trim());
      if (typeFilter) qs.set("classification", typeFilter);
      const rangeMs = TIME_RANGES.find((r) => r.key === range)?.ms ?? 0;
      if (rangeMs) qs.set("since", String(Date.now() - rangeMs));
      if (q.trim()) qs.set("q", q.trim());
      qs.set("limit", String(limit));
      const res = await fetch(`/api/admin/support/list?${qs.toString()}`, { cache: "no-store" });
      if (seq !== listSeq.current) return;
      if (res.status === 403) { setForbidden(true); return; }
      const json = (await res.json()) as {
        tickets?: Ticket[]; error?: string; admin?: { email?: string }; metaPending?: boolean;
      };
      if (seq !== listSeq.current) return;
      if (!res.ok) { setError(json.error || "Failed to load"); setTickets([]); return; }
      if (json.admin?.email) setMyEmail(json.admin.email.toLowerCase());
      setMetaPending(!!json.metaPending);
      setTickets(json.tickets ?? []);
    } catch (e) {
      if (seq !== listSeq.current) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setTickets([]);
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [activeBucket, priority, tier, typeFilter, range, q, limit, loadDrafts]);

  // Any filter change starts paging over from the first page.
  const filterKey = [bucket, priority, tier, typeFilter, range, q].join("|");
  useEffect(() => { setLimit(PAGE_SIZE); }, [filterKey]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support/health", { cache: "no-store" });
      if (!res.ok) return;
      setHealth((await res.json()) as Health);
    } catch { /* banner just stays hidden */ }
  }, []);

  useEffect(() => { setViews(loadViews()); }, []);

  // Apply the typed search after a short pause (Enter applies it at once).
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  // Notes, assignee and any pending bot draft live in Supabase, not the Worker,
  // so they load beside the ticket. A pending draft pre-fills the reply box.
  const loadTicketExtras = useCallback(async (id: string) => {
    try {
      const [nRes, dRes] = await Promise.all([
        fetch(`/api/admin/support/notes?id=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/admin/support/drafts?ticket=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      if (nRes.ok) {
        const nj = (await nRes.json()) as { notes?: TicketNote[]; assignee?: string; migrationPending?: boolean };
        setNotes(nj.notes ?? []);
        setAssignee(nj.assignee ?? "");
        if (nj.migrationPending) setMetaPending(true);
      }
      if (dRes.ok) {
        const dj = (await dRes.json()) as { draft?: BotDraft | null };
        if (dj.draft) {
          setActiveDraft(dj.draft);
          setReplySubject(dj.draft.subject.slice(0, 180));
          setReplyBody(dj.draft.body);
          setSuggestMeta({
            confidence: dj.draft.confidence,
            grounded: dj.draft.grounded,
            action: "auto_answer",
            reason: dj.draft.reason,
          });
        }
      }
    } catch { /* extras are optional; the ticket itself already loaded */ }
  }, []);

  const openTicket = useCallback(async (id: string) => {
    setActionMsg("");
    setDetailBusy(true);
    try {
      const res = await fetch(`/api/admin/support/get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 403) { setForbidden(true); return; }
      const json = (await res.json()) as { ticket?: Ticket; error?: string };
      if (!res.ok || !json.ticket) { setActionMsg(json.error || "Failed to load ticket"); return; }
      const t = json.ticket;
      setSelected(t);
      setEditPriority(t.priority || "P2");
      setEditTags(t.tags || "");
      setReplySubject(`Re: ${t.title || ""}`.slice(0, 180));
      setReplyBody("");
      setReplyAdvance(true);
      setReplyAttachments([]);
      setReplyInlineImages([]);
      setSuggestMeta(null);
      setSuggestReason("");
      setCursorId(t.id);
      setActiveDraft(null);
      setNotes([]);
      setNoteText("");
      setAssignee(t.assignee || "");
      void loadTicketExtras(t.id);
    } finally {
      setDetailBusy(false);
    }
  }, [loadTicketExtras]);

  // Load every ticket a user has submitted. The Worker's /agent/inbox `q` is a
  // fuzzy match over title/text/email, so exact-filter on userEmail afterwards
  // (same pattern as the scheduling prep route).
  const openUserHistory = useCallback(async (email: string) => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setUserView({ email, tickets: [], loading: true, error: null });
    try {
      const qs = new URLSearchParams({ q: email, limit: "100" });
      const res = await fetch(`/api/admin/support/list?${qs.toString()}`, { cache: "no-store" });
      if (res.status === 403) { setForbidden(true); return; }
      const json = (await res.json()) as { tickets?: Ticket[]; error?: string };
      if (!res.ok) {
        setUserView({ email, tickets: [], loading: false, error: json.error || "Failed to load" });
        return;
      }
      const mine = (json.tickets ?? [])
        .filter((t) => (t.userEmail || "").toLowerCase() === target || (t.requesterEmail || "").toLowerCase() === target)
        .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
      setUserView({ email, tickets: mine, loading: false, error: null });
    } catch (e) {
      setUserView({ email, tickets: [], loading: false, error: e instanceof Error ? e.message : "Failed to load" });
    }
  }, []);

  // Initial load + deep link (?ticket=fb-...) from the escalation email.
  useEffect(() => {
    fetchCounts();
    fetchList();
    fetchHealth();
    void loadDrafts();
    try {
      const id = new URLSearchParams(window.location.search).get("ticket");
      if (id) openTicket(id);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch the list when filters change.
  useEffect(() => { fetchList(); }, [fetchList]);

  const doTriage = useCallback(async (patch: Record<string, unknown>, note: string) => {
    if (!selected) return;
    setDetailBusy(true);
    setActionMsg(note);
    try {
      const res = await fetch("/api/admin/support/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, ...patch }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setActionMsg(json.error || "Failed"); return; }
      setActionMsg("Saved.");
      await Promise.all([openTicket(selected.id), fetchList(), fetchCounts()]);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setDetailBusy(false);
    }
  }, [selected, openTicket, fetchList, fetchCounts]);

  // Statuses where a human reply should hand the ball back to the customer.
  const replyCanAdvance = !!selected && ["sent", "user_replied", "clarifying", "escalated"].includes(selected.status);

  // Read dropped/picked/pasted files into base64 media, enforcing the same caps
  // the server route re-checks. `attachment` files download; `inline` images
  // embed in the email body.
  const ingestFiles = useCallback(async (files: File[], kind: "attachment" | "inline") => {
    if (!files.length) return;
    const existing = kind === "attachment" ? replyAttachments : replyInlineImages;
    const max = kind === "attachment" ? MAX_ATTACHMENTS : MAX_INLINE_IMAGES;
    let runningTotal = [...replyAttachments, ...replyInlineImages].reduce((n, m) => n + m.size, 0);
    const added: ReplyMedia[] = [];
    for (const file of files) {
      if (kind === "inline" && !file.type.startsWith("image/")) continue;
      if (existing.length + added.length >= max) {
        setActionMsg(`You can attach at most ${max} ${kind === "attachment" ? "files" : "images"}.`);
        break;
      }
      if (file.size > MAX_ITEM_BYTES) {
        setActionMsg(`"${file.name}" is too large (max 3 MB per file).`);
        continue;
      }
      if (runningTotal + file.size > MAX_TOTAL_MEDIA_BYTES) {
        setActionMsg("Attachments are too large together (max 3 MB total).");
        break;
      }
      try {
        const b64 = await readFileToB64(file);
        if (!b64) continue;
        added.push({
          id: crypto.randomUUID(),
          filename: file.name || (kind === "inline" ? "image.png" : "attachment"),
          contentType: file.type || "application/octet-stream",
          b64,
          size: file.size,
        });
        runningTotal += file.size;
      } catch {
        setActionMsg(`Could not read "${file.name}".`);
      }
    }
    if (added.length) {
      if (kind === "attachment") setReplyAttachments((p) => [...p, ...added]);
      else setReplyInlineImages((p) => [...p, ...added]);
    }
  }, [replyAttachments, replyInlineImages]);

  const onReplyPaste = useCallback((e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imgs: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      void ingestFiles(imgs, "inline");
    }
  }, [ingestFiles]);

  const onReplyDrop = useCallback((e: ReactDragEvent<HTMLElement>) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    e.preventDefault();
    void ingestFiles(files, "attachment");
  }, [ingestFiles]);

  const removeAttachment = useCallback((id: string) => {
    setReplyAttachments((p) => p.filter((m) => m.id !== id));
  }, []);
  const removeInlineImage = useCallback((id: string) => {
    setReplyInlineImages((p) => p.filter((m) => m.id !== id));
  }, []);

  const doReply = useCallback(async () => {
    if (!selected) return;
    if (!replySubject.trim() || !replyBody.trim()) { setActionMsg("Subject and body are required."); return; }
    setDetailBusy(true);
    setActionMsg("Sending reply…");
    try {
      const advance = replyAdvance && ["sent", "user_replied", "clarifying", "escalated"].includes(selected.status);
      const res = await fetch("/api/admin/support/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          subject: replySubject.trim(),
          body: replyBody.trim(),
          ...(advance ? { advanceStatus: "waiting_on_user" } : {}),
          ...(selected.requesterEmail ? { toRequester: true } : {}),
          ...(replyAttachments.length
            ? { attachments: replyAttachments.map((m) => ({ filename: m.filename, content: m.b64, contentType: m.contentType })) }
            : {}),
          ...(replyInlineImages.length
            ? { inlineImages: replyInlineImages.map((m) => ({ filename: m.filename, content: m.b64, contentType: m.contentType })) }
            : {}),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; warning?: string };
      if (!res.ok || !json.ok) { setActionMsg(json.error || "Reply failed"); return; }
      setActionMsg(json.warning ? `Reply sent. Warning: ${json.warning}` : "Reply sent.");
      if (activeDraft) {
        const edited = replyBody.trim() !== activeDraft.body.trim();
        void fetch("/api/admin/support/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draftId: activeDraft.id, outcome: edited ? "edited_sent" : "sent" }),
        });
        setActiveDraft(null);
        void loadDrafts();
      }
      setReplyBody("");
      setReplyAttachments([]);
      setReplyInlineImages([]);
      await Promise.all([openTicket(selected.id), fetchList(), fetchCounts()]);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setDetailBusy(false);
    }
  }, [selected, replySubject, replyBody, replyAdvance, replyAttachments, replyInlineImages, activeDraft, openTicket, fetchList, fetchCounts, loadDrafts]);

  const rejectDraft = useCallback(async () => {
    if (!activeDraft) return;
    const reason = window.prompt("Why reject this draft? (optional, helps tune the bot)");
    if (reason === null) return;
    const res = await fetch("/api/admin/support/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: activeDraft.id, outcome: "rejected", reason }),
    });
    if (!res.ok) { setActionMsg("Could not reject the draft."); return; }
    if (replyBody.trim() === activeDraft.body.trim()) {
      setReplyBody("");
      setReplySubject(`Re: ${selected?.title || ""}`.slice(0, 180));
    }
    setActiveDraft(null);
    setSuggestMeta(null);
    setActionMsg("Draft rejected.");
    void loadDrafts();
    void fetchList();
  }, [activeDraft, replyBody, selected, loadDrafts, fetchList]);

  const saveNote = useCallback(async () => {
    if (!selected || !noteText.trim()) return;
    const res = await fetch("/api/admin/support/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selected.id, body: noteText }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setActionMsg(json.error || "Could not save the note."); return; }
    setNoteText("");
    void loadTicketExtras(selected.id);
    void fetchList();
  }, [selected, noteText, loadTicketExtras, fetchList]);

  const doAssign = useCallback(async (who: string) => {
    if (!selected) return;
    const res = await fetch("/api/admin/support/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selected.id, assignee: who }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; assignee?: string };
    if (!res.ok) { setActionMsg(json.error || "Could not assign."); return; }
    setAssignee(json.assignee ?? "");
    void fetchList();
  }, [selected, fetchList]);

  // Draft a grounded reply with AI and drop it into the reply box for review.
  const doSuggest = useCallback(async () => {
    if (!selected) return;
    setSuggesting(true);
    setSuggestReason("");
    setActionMsg("Drafting a reply…");
    try {
      const res = await fetch("/api/admin/support/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        subject?: string;
        body?: string;
        reason?: string;
        confidence?: number;
        action?: string;
        grounded?: boolean;
      };
      if (!res.ok || !json.ok) { setActionMsg(json.error || "Could not draft a reply."); return; }
      if (json.subject) setReplySubject(json.subject.slice(0, 180));
      if (json.body) setReplyBody(json.body);
      setSuggestMeta({
        confidence: typeof json.confidence === "number" ? json.confidence : null,
        grounded: !!json.grounded,
        action: json.action || "",
        reason: json.reason || "",
      });
      const conf = typeof json.confidence === "number" ? ` · ${Math.round(json.confidence * 100)}% sure` : "";
      const grounded = json.grounded ? "grounded in help articles" : "no matching help article found, review carefully";
      setSuggestReason(`Draft ready (${grounded}${conf}). Review and edit before sending.`);
      setActionMsg("Draft ready. Review before sending.");
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Could not draft a reply.");
    } finally {
      setSuggesting(false);
    }
  }, [selected]);

  // Facet options come from what is loaded, so they always match real data.
  const facets = useMemo(() => {
    const platforms = new Set<string>();
    const versions = new Set<string>();
    const tiers = new Set<string>(KNOWN_TIERS);
    const tags = new Set<string>();
    for (const t of tickets) {
      if (t.platform) platforms.add(t.platform);
      if (t.appVersion) versions.add(t.appVersion);
      if (t.licenseTier) tiers.add(t.licenseTier.toLowerCase());
      for (const g of ticketTags(t)) tags.add(g);
    }
    const sortAlpha = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return {
      platforms: sortAlpha(platforms),
      versions: Array.from(versions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
      tiers: sortAlpha(tiers),
      tags: sortAlpha(tags),
    };
  }, [tickets]);

  // Client-side facets the Worker does not filter on, then the chosen sort.
  const visible = useMemo(() => {
    let list = tickets;
    if (platformFilter) list = list.filter((t) => t.platform === platformFilter);
    if (versionFilter) list = list.filter((t) => t.appVersion === versionFilter);
    if (tagFilter) list = list.filter((t) => ticketTags(t).includes(tagFilter));
    if (mineOnly) list = list.filter((t) => !!myEmail && (t.assignee || "").toLowerCase() === myEmail);
    const mode = sort === "auto"
      ? (bucket === "needsMe" || bucket === "waiting" ? "priority" : "newest")
      : sort;
    const out = [...list];
    if (mode === "oldest") out.sort((a, b) => lastActivity(a) - lastActivity(b));
    else if (mode === "newest") out.sort((a, b) => lastActivity(b) - lastActivity(a));
    else {
      out.sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority] ?? 2;
        const pb = PRIORITY_RANK[b.priority] ?? 2;
        return pa - pb || lastActivity(a) - lastActivity(b);
      });
    }
    return out;
  }, [tickets, platformFilter, versionFilter, tagFilter, mineOnly, myEmail, sort, bucket]);

  const saveView = useCallback(() => {
    const name = window.prompt("Name this view (e.g. Mac crashes this week)");
    if (!name || !name.trim()) return;
    const v: SavedView = {
      name: name.trim().slice(0, 40), bucket, priority, tier, type: typeFilter,
      platform: platformFilter, version: versionFilter, tag: tagFilter, range, sort,
    };
    const next = [...views.filter((x) => x.name !== v.name), v];
    setViews(next);
    storeViews(next);
  }, [views, bucket, priority, tier, typeFilter, platformFilter, versionFilter, tagFilter, range, sort]);

  const applyView = useCallback((name: string) => {
    const v = views.find((x) => x.name === name);
    if (!v) return;
    setBucket(v.bucket); setPriority(v.priority); setTier(v.tier); setTypeFilter(v.type);
    setPlatformFilter(v.platform); setVersionFilter(v.version); setTagFilter(v.tag);
    setRange(v.range); setSort(v.sort);
  }, [views]);

  const deleteView = useCallback((name: string) => {
    const next = views.filter((x) => x.name !== name);
    setViews(next);
    storeViews(next);
  }, [views]);

  const clearFilters = useCallback(() => {
    setPriority(""); setTier(""); setTypeFilter(""); setPlatformFilter("");
    setVersionFilter(""); setTagFilter(""); setRange(""); setSort("auto");
  }, []);

  const filtersActive = !!(priority || tier || typeFilter || platformFilter || versionFilter || tagFilter || range);

  // Taking over marks the ticket human-owned: the sweep and the autopilot both
  // hard-skip tagged tickets until "Release to bot" removes the tag.
  const takeOver = useCallback(() => {
    if (!selected) return;
    const tags = ticketTags(selected);
    if (!tags.includes("human-owned")) tags.push("human-owned");
    void doTriage(
      { status: "escalated", escalatedReason: "Taken over from the dashboard", tags: tags.join(", ") },
      "Taking over…",
    );
  }, [selected, doTriage]);

  const releaseToBot = useCallback(() => {
    if (!selected) return;
    const tags = ticketTags(selected).filter((x) => x !== "human-owned");
    void doTriage({ tags: tags.join(", ") }, "Releasing to the bot…");
  }, [selected, doTriage]);

  // Move through the visible list (list cursor, or next/prev inside the drawer).
  const stepTicket = useCallback((delta: number) => {
    if (!visible.length) return;
    const from = selected?.id ?? cursorId;
    const idx = from ? visible.findIndex((t) => t.id === from) : -1;
    const nextIdx = idx < 0 ? (delta > 0 ? 0 : visible.length - 1) : Math.min(visible.length - 1, Math.max(0, idx + delta));
    const next = visible[nextIdx];
    if (!next) return;
    setCursorId(next.id);
    if (selected) void openTicket(next.id);
  }, [visible, selected, cursorId, openTicket]);

  // Keyboard shortcuts. The handler is re-bound whenever its inputs change, and
  // ignores keystrokes while typing in a field or with a modifier held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "Escape") {
        if (showHelp) setShowHelp(false);
        else if (selected && !typing) setSelected(null);
        else if (userView && !typing) setUserView(null);
        return;
      }
      if (typing) return;
      const k = e.key;
      if (k === "h") { e.preventDefault(); setShowHelp((v) => !v); return; }
      if (k === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (k === "j" || k === "ArrowDown") { e.preventDefault(); stepTicket(1); return; }
      if (k === "k" || k === "ArrowUp") { e.preventDefault(); stepTicket(-1); return; }
      if (k === "Enter" && !selected && cursorId) { e.preventDefault(); void openTicket(cursorId); return; }
      if (!selected || detailBusy) return;
      if (k === "r") { e.preventDefault(); replyRef.current?.focus(); return; }
      if (k === "e") { e.preventDefault(); void doTriage({ status: "fixed" }, "Resolving…"); return; }
      if (k === "a") { e.preventDefault(); void doTriage({ status: "archived" }, "Archiving…"); return; }
      if (k === "S") { e.preventDefault(); void doTriage({ status: "spam", classification: "spam" }, "Marking spam…"); return; }
      if (k === "t") { e.preventDefault(); takeOver(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, userView, showHelp, cursorId, detailBusy, stepTicket, openTicket, doTriage, takeOver]);

  if (forbidden) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">Support</h1>
        <p className="mt-2 text-sm text-slate-600">Admin only. You don&apos;t have the support.view permission.</p>
      </div>
    );
  }

  const queueTiles = [
    { label: "Escalated", value: counts.escalated ?? 0, tone: "text-rose-600" },
    { label: "User replied", value: counts.user_replied ?? 0, tone: "text-amber-600" },
    { label: "Waiting on user", value: counts.waiting_on_user ?? 0, tone: "text-amber-600" },
    { label: "New", value: counts.sent ?? 0, tone: "text-sky-600" },
    { label: "Fixed", value: counts.fixed ?? 0, tone: "text-emerald-600" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Support</h1>
          <p className="mt-1 text-sm text-slate-500">
            The support bot triages new tickets automatically. Jump in on escalations and anything it hands back.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { fetchList(); fetchCounts(); fetchHealth(); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Pipeline health: is the AI team running, and in which mode? */}
      {health && (
        <div
          role="status"
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-sm ${
            health.stale ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          <span className="font-medium text-slate-900">AI support team</span>
          <span>
            Bot last active:{" "}
            <strong className={health.stale ? "text-amber-800" : "text-slate-800"}>{health.lastBotAt ? ago(health.lastBotAt) : "no activity found"}</strong>
            {health.stale ? ` (expected ${health.expectedCadence})` : ""}
          </span>
          <span>
            Auto-replies:{" "}
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${health.sweep.mode === "live" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
              {health.sweep.mode === "live" ? "LIVE" : "SHADOW (drafts only)"}
            </span>{" "}
            <span className="text-slate-500">min {Math.round(health.sweep.minConfidence * 100)}% sure, max {health.sweep.maxSendsPerRun} per run</span>
          </span>
          <span>Sent in the last 24h: <strong className="text-slate-800">{health.autoAnswered24h}</strong></span>
          <span>
            Needs you: <strong className="text-slate-800">{health.needsMeCount}</strong>
            {health.oldestNeedsMeAt ? <span className="text-slate-500"> (oldest {ago(health.oldestNeedsMeAt)})</span> : null}
          </span>
          <span className="text-slate-500">
            Auto-close: {health.autoClose.waitingOnUserDays}d waiting on customer, {health.autoClose.noReplyDays}d with no reply
          </span>
        </div>
      )}

      {/* Queue tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {queueTiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              const b = BUCKETS.find((x) => x.statuses.includes(
                t.label === "Escalated" ? "escalated"
                : t.label === "User replied" ? "user_replied"
                : t.label === "Waiting on user" ? "waiting_on_user"
                : t.label === "New" ? "sent" : "fixed",
              ));
              if (b) setBucket(b.key);
            }}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${t.tone}`}>{t.value.toLocaleString("en-US")}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucket(b.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                bucket === b.key ? "bg-[#c2410c] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {b.label}
              {b.key === "drafts" && draftCount !== null && draftCount > 0 ? (
                <span className={`ml-1.5 text-xs ${bucket === b.key ? "text-white/90" : "text-slate-500"}`}>{draftCount}</span>
              ) : null}
              {b.statuses.length > 0 && b.key !== "resolved" && b.key !== "archived" && b.key !== "spam" ? (
                <span className={`ml-1.5 text-xs ${bucket === b.key ? "text-white/90" : "text-slate-500"}`}>
                  {b.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0).toLocaleString("en-US")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
          aria-label="Priority filter"
        >
          {PRIORITIES.map((p) => <option key={p || "any"} value={p}>{p || "Any priority"}</option>)}
        </select>
        <label className="sr-only" htmlFor="support-tier">Tier filter</label>
        <input
          id="support-tier"
          list="support-tier-options"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          placeholder="Tier (e.g. growth)"
          className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
        />
        <datalist id="support-tier-options">
          {facets.tiers.map((x) => <option key={x} value={x} />)}
        </datalist>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (qInput === q) fetchList();
            else setQ(qInput);
          }}
          className="flex items-center gap-1"
        >
          <label className="sr-only" htmlFor="support-search">Search tickets</label>
          <input
            id="support-search"
            ref={searchRef}
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search ID / title / text / email"
            className="w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Search
          </button>
        </form>
      </div>
      {/* Second filter row: facets, sort, saved views */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {([
          { id: "type", label: "Type", value: typeFilter, set: setTypeFilter, all: "Any type", opts: ["bug", "feature", "question", "spam"] },
          { id: "platform", label: "Platform", value: platformFilter, set: setPlatformFilter, all: "Any platform", opts: facets.platforms },
          { id: "version", label: "App version", value: versionFilter, set: setVersionFilter, all: "Any version", opts: facets.versions },
          { id: "tag", label: "Tag", value: tagFilter, set: setTagFilter, all: "Any tag", opts: facets.tags },
        ] as const).map((f) => (
          <span key={f.id}>
            <label className="sr-only" htmlFor={`support-${f.id}`}>{f.label} filter</label>
            <select
              id={`support-${f.id}`}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
            >
              <option value="">{f.all}</option>
              {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </span>
        ))}
        <span>
          <label className="sr-only" htmlFor="support-range">Date range</label>
          <select id="support-range" value={range} onChange={(e) => setRange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700">
            {TIME_RANGES.map((r) => <option key={r.key || "any"} value={r.key}>{r.label}</option>)}
          </select>
        </span>
        <span>
          <label className="sr-only" htmlFor="support-sort">Sort</label>
          <select id="support-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700">
            {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
          </select>
        </span>
        <label className="flex items-center gap-1.5 text-slate-700">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded border-slate-300" />
          Assigned to me
        </label>
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="font-medium text-orange-700 underline">Clear filters</button>
        )}
        <span className="ml-auto flex items-center gap-2">
          {views.length > 0 && (
            <span>
              <label className="sr-only" htmlFor="support-views">Saved views</label>
              <select
                id="support-views"
                value=""
                onChange={(e) => { if (e.target.value) applyView(e.target.value); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
              >
                <option value="">Saved views</option>
                {views.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </span>
          )}
          <button type="button" onClick={saveView} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Save view</button>
          {views.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const name = window.prompt(`Delete which saved view?\n${views.map((v) => v.name).join(", ")}`);
                if (name) deleteView(name.trim());
              }}
              className="text-slate-500 underline"
            >
              Delete view
            </button>
          )}
          <button type="button" onClick={() => setShowHelp(true)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50" aria-label="Support page shortcuts (H)" title="Support page shortcuts (H)">H</button>
        </span>
      </div>
      {q.trim() ? (
        <p className="-mt-2 text-xs text-slate-500">
          Showing matches for &ldquo;{q.trim()}&rdquo; across all statuses.{" "}
          <button
            type="button"
            onClick={() => { setQInput(""); setQ(""); }}
            className="font-medium text-orange-700 underline"
          >
            Clear search
          </button>
        </p>
      ) : null}

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {metaPending && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Notes, assignees and bot drafts need one database step: paste{" "}
          <code className="rounded bg-white px-1 py-0.5 text-xs">supabase/migrations/20261121_support_notes_assignee_drafts.sql</code>{" "}
          into the Supabase SQL editor. Everything else works without it.
        </div>
      )}

      {/* Bot drafts: replies the sweep wrote but did not send. Review, edit, send or reject. */}
      {bucket === "drafts" && !q.trim() && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            These are replies the auto-reply sweep would have sent. Open one to review it in the reply box, edit if needed,
            then send or reject. Your approve, edit and reject choices show how ready the bot is to run live.
          </p>
          {loading && draftRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : draftRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No drafts waiting. New ones appear after the next sweep run.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {draftRows.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => void openTicket(d.ticketId)}
                    className="block w-full px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${priorityClasses(d.priority)}`}>{d.priority || "P2"}</span>
                      <span className="font-mono text-slate-500">{shortId(d.ticketId)}</span>
                      {d.confidence != null ? (
                        <span className={`rounded px-1.5 py-0.5 font-medium ${d.confidence >= 0.75 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                          {Math.round(d.confidence * 100)}% sure
                        </span>
                      ) : null}
                      <span className={d.grounded ? "text-emerald-700" : "text-amber-700"}>{d.grounded ? "grounded in help articles" : "no help article match"}</span>
                      <span className="ml-auto text-slate-500">{ago(Date.parse(d.createdAt) || null)}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{d.title || "(no title)"}</div>
                    <div className="text-xs text-slate-500">{d.customerEmail || "no email"}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{d.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Table */}
      <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${bucket === "drafts" && !q.trim() ? "hidden" : ""}`}>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Ticket</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Last activity</th>
              <th className="px-3 py-2">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && visible.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No tickets in this view.</td></tr>
            ) : (
              visible.map((t) => {
                const bs = botState(t);
                return (
                <tr
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  aria-selected={cursorId === t.id}
                  className={`cursor-pointer hover:bg-slate-50 ${selected?.id === t.id ? "bg-orange-50/50" : ""} ${cursorId === t.id && selected?.id !== t.id ? "bg-slate-50 outline outline-2 -outline-offset-2 outline-orange-300" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500" title={t.id}>
                    {t.status === "user_replied" || t.status === "escalated" ? (
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" aria-label="Needs your attention" />
                    ) : null}
                    {shortId(t.id)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${priorityClasses(t.priority)}`}>{t.priority || "P2"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusClasses(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.classification || t.type}</td>
                  <td className="px-3 py-2 text-slate-900">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void openTicket(t.id); }}
                      className="text-left hover:underline"
                    >
                      {t.title || "(no title)"}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {bs && <span className={`rounded px-1.5 py-0.5 font-medium ${bs.tone}`}>{bs.label}</span>}
                      {t.draftId ? <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">bot draft ready</span> : null}
                      {t.assignee ? (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700" title={`Assigned to ${t.assignee}`}>
                          {t.assignee.toLowerCase() === myEmail ? "mine" : t.assignee.split("@")[0]}
                        </span>
                      ) : null}
                      {t.noteCount ? <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800" title="Internal notes">{t.noteCount} note{t.noteCount === 1 ? "" : "s"}</span> : null}
                      {t.requesterEmail ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600" title={`Customer: ${t.requesterEmail}`}>from call/chat</span> : null}
                      {t.platform ? <span>{t.platform}</span> : null}
                      {t.appVersion ? <span>v{String(t.appVersion).replace(/^v/i, "")}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{t.licenseTier || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {t.userEmail ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openUserHistory(t.userEmail); }}
                        className="text-left text-slate-500 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-[#f97316]"
                        title={`All tickets from ${t.userEmail}`}
                      >
                        {t.userEmail}
                      </button>
                    ) : (
                      "anon"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700" title={fullTime(lastActivity(t) || null)}>{ago(lastActivity(t) || null)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{ago(t.submittedAt)}</td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <span>
            Showing {visible.length.toLocaleString("en-US")}
            {visible.length !== tickets.length ? ` of ${tickets.length.toLocaleString("en-US")} loaded` : ""}
            {!q.trim() && activeBucket.statuses.length > 0 && !filtersActive
              ? ` of ${activeBucket.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0).toLocaleString("en-US")} in this tab`
              : ""}
          </span>
          {tickets.length >= limit && (
            <button
              type="button"
              disabled={loading}
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Loading…" : `Load ${PAGE_SIZE} more`}
            </button>
          )}
        </div>
      </div>

      {/* Per-user history drawer: sits under the ticket drawer (z-30 vs z-40),
          so opening a ticket from the list layers it on top; closing the
          ticket drops you back on the history. */}
      {userView && (
        <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/30" onClick={() => setUserView(null)}>
          <div
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{userView.email}</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {userView.loading
                    ? "Loading ticket history…"
                    : `${userView.tickets.length} ticket${userView.tickets.length === 1 ? "" : "s"} submitted`}
                </p>
              </div>
              <button type="button" onClick={() => setUserView(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>

            {userView.error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{userView.error}</div>}

            {/* Status rollup */}
            {!userView.loading && userView.tickets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(
                  userView.tickets.reduce<Record<string, number>>((acc, t) => {
                    acc[t.status] = (acc[t.status] ?? 0) + 1;
                    return acc;
                  }, {}),
                ).map(([status, n]) => (
                  <span key={status} className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusClasses(status)}`}>
                    {status} · {n}
                  </span>
                ))}
              </div>
            )}

            <ol className="mt-4 space-y-2">
              {userView.loading ? (
                <li className="py-8 text-center text-sm text-slate-400">Loading…</li>
              ) : userView.tickets.length === 0 && !userView.error ? (
                <li className="py-8 text-center text-sm text-slate-400">No tickets found for this user.</li>
              ) : (
                userView.tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTicket(t.id)}
                      className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${priorityClasses(t.priority)}`}>{t.priority || "P2"}</span>
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusClasses(t.status)}`}>{t.status}</span>
                        <span className="text-xs text-slate-400">{t.classification || t.type}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-400">{ago(t.submittedAt)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-900">{t.title || "(no title)"}</div>
                      {t.resolvedVersion && (
                        <div className="mt-0.5 text-xs text-emerald-600">shipped in v{String(t.resolvedVersion).replace(/^v/i, "")}</div>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${priorityClasses(selected.priority)}`}>{selected.priority || "P2"}</span>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusClasses(selected.status)}`}>{selected.status}</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">{selected.title || "(no title)"}</h2>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{selected.id}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => stepTicket(-1)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50" aria-label="Previous ticket (K)" title="Previous ticket (K)">← Prev</button>
                <button type="button" onClick={() => stepTicket(1)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50" aria-label="Next ticket (J)" title="Next ticket (J)">Next →</button>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
              </div>
            </div>

            {actionMsg &&<div className="mt-3 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-600">{actionMsg}</div>}

            {/* Release / handling state banner */}
            {(() => { const rs = releaseState(selected); return (
              <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${rs.tone}`}>{rs.text}</div>
            ); })()}

            {/* What the bot did and why it stopped: so you do not have to dig through notes */}
            {(() => {
              const bs = botState(selected);
              const tags = ticketTags(selected);
              const hasAny = bs || selected.escalatedReason || suggestMeta || selected.lastTriagedAt;
              if (!hasAny) return null;
              const pct = suggestMeta?.confidence != null ? Math.round(suggestMeta.confidence * 100) : null;
              return (
                <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm" aria-label="Bot assessment">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bot assessment</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {bs && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${bs.tone}`}>{bs.label}</span>}
                    {tags.map((g) => (
                      <span key={g} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{g}</span>
                    ))}
                    <span className="text-xs text-slate-500">
                      {selected.lastTriagedAt ? `last worked ${ago(selected.lastTriagedAt)}` : "bot has not worked this yet"}
                    </span>
                  </div>
                  {tags.includes("human-owned") && (
                    <p className="mt-2 text-xs text-indigo-700">You own this ticket. The auto-reply sweep and the autopilot will not touch it until you click Release to bot.</p>
                  )}
                  {selected.escalatedReason && (
                    <p className="mt-2 text-slate-700"><span className="font-medium text-rose-700">Why it was handed back:</span> {selected.escalatedReason}</p>
                  )}
                  {suggestMeta ? (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span>Draft confidence</span>
                        {pct != null ? (
                          <>
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pct} percent confident`}>
                              <div className={`h-full ${pct >= 75 ? "bg-emerald-600" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="font-semibold text-slate-800">{pct}%</span>
                          </>
                        ) : <span>n/a</span>}
                        <span className={suggestMeta.grounded ? "text-emerald-700" : "text-amber-700"}>
                          {suggestMeta.grounded ? "grounded in help articles" : "no matching help article"}
                        </span>
                        {suggestMeta.action ? <span className="text-slate-500">bot would: {suggestMeta.action.replace(/_/g, " ")}</span> : null}
                      </div>
                      {suggestMeta.reason ? <p className="mt-1 text-xs text-slate-600">{suggestMeta.reason}</p> : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Click Suggest reply below to see how confident the bot is and why.</p>
                  )}
                </section>
              );
            })()}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div><dt className="text-slate-400">Type</dt><dd className="text-slate-700">{selected.classification || selected.type}</dd></div>
              <div><dt className="text-slate-400">Tier</dt><dd className="text-slate-700">{selected.licenseTier || "—"}</dd></div>
              <div>
                <dt className="text-slate-400">User</dt>
                <dd className="text-slate-700">
                  {selected.userEmail ? (
                    <button
                      type="button"
                      onClick={() => { openUserHistory(selected.userEmail); setSelected(null); }}
                      className="text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-[#f97316]"
                      title={`All tickets from ${selected.userEmail}`}
                    >
                      {selected.userEmail}
                    </button>
                  ) : (
                    "anonymous"
                  )}
                </dd>
              </div>
              <div><dt className="text-slate-400">Platform</dt><dd className="text-slate-700">{selected.platform || "—"}</dd></div>
              <div><dt className="text-slate-400">App version</dt><dd className="text-slate-700">{selected.appVersion || "—"}</dd></div>
              <div><dt className="text-slate-400">Submitted</dt><dd className="text-slate-700">{fullTime(selected.submittedAt)}</dd></div>
              <div><dt className="text-slate-400">Last worked by bot</dt><dd className="text-slate-700">{selected.lastTriagedAt ? fullTime(selected.lastTriagedAt) : "not yet"}</dd></div>
              <div><dt className="text-slate-400">Last reply</dt><dd className="text-slate-700">{selected.repliedAt ? fullTime(selected.repliedAt) : "none"}</dd></div>
              {selected.requesterEmail && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Customer (ticket auto-filed from a call or chat)</dt>
                  <dd className="text-slate-700">
                    <button
                      type="button"
                      onClick={() => { openUserHistory(selected.requesterEmail || ""); setSelected(null); }}
                      className="text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-[#f97316]"
                    >
                      {selected.requesterEmail}
                    </button>
                  </dd>
                </div>
              )}
              <div className="col-span-2">
                <dt className="text-slate-400">Assigned to</dt>
                <dd className="flex flex-wrap items-center gap-2 text-slate-700">
                  <span>{assignee ? (assignee.toLowerCase() === myEmail ? "You" : assignee) : "Nobody"}</span>
                  {assignee.toLowerCase() !== myEmail && myEmail ? (
                    <button type="button" onClick={() => void doAssign("me")} className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Assign to me</button>
                  ) : null}
                  {assignee ? (
                    <button type="button" onClick={() => void doAssign("")} className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">Unassign</button>
                  ) : null}
                </dd>
              </div>
              <div><dt className="text-slate-400">Shipped in</dt><dd className="text-slate-700">{selected.resolvedVersion ? `v${String(selected.resolvedVersion).replace(/^v/i, "")}${selected.resolvedAt ? ` (${fullTime(selected.resolvedAt)})` : ""}` : "—"}</dd></div>
              {selected.fixCommitSha && <div><dt className="text-slate-400">Branch</dt><dd className="text-slate-700">main</dd></div>}
              {selected.escalatedReason && <div className="col-span-2"><dt className="text-slate-400">Escalated reason</dt><dd className="text-rose-700">{selected.escalatedReason}</dd></div>}
              {selected.fixCommitSha && <div className="col-span-2"><dt className="text-slate-400">Fix commit</dt><dd><a className="font-mono text-xs text-[#f97316] hover:underline" href={`${REPO_URL}/commit/${selected.fixCommitSha}`} target="_blank" rel="noreferrer">{selected.fixCommitSha.slice(0, 12)} ↗ (see the diff)</a></dd></div>}
              {selected.githubIssueUrl && <div><dt className="text-slate-400">GitHub</dt><dd><a className="text-[#f97316] hover:underline" href={selected.githubIssueUrl} target="_blank" rel="noreferrer">issue / PR ↗</a></dd></div>}
            </dl>

            {/* Lifecycle timeline */}
            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle</h3>
              <ol className="mt-2 space-y-2">
                {buildTimeline(selected).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${s.done ? "bg-[#f97316]" : "bg-slate-300"}`} />
                    <div>
                      <span className={s.done ? "text-slate-800" : "text-slate-400"}>{s.label}</span>
                      {s.at && <span className="ml-2 text-xs text-slate-400">{fullTime(s.at)}</span>}
                      {s.detail && <span className="ml-2 text-xs text-slate-500">{s.detail}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</h3>
              <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{selected.description || "(empty)"}</pre>
              {/* Screenshots / files the customer sent on the opening email.
                  These replace the bare "[image: image.png]" placeholder that
                  used to be all we kept. */}
              <AttachmentGallery items={selected.attachments} />
            </section>

            {selected.agentNotes && (
              <section className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bot notes</h3>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{selected.agentNotes}</pre>
              </section>
            )}

            {/* Diagnostic logs: the customer's app auto-attaches a redacted log
                bundle on submit; the worker stores up to 128 KB as log_tail.
                The list view omits it to stay lean, so it only appears here. */}
            {selected.logTail && selected.logTail.trim() && (
              <section className="mt-3">
                <details>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
                    Diagnostic logs
                    <span className="ml-1 font-normal normal-case text-slate-400">
                      ({Math.round(selected.logTail.length / 1024)} KB, auto-attached by the app)
                    </span>
                  </summary>
                  <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{selected.logTail}</pre>
                </details>
              </section>
            )}

            {/* Reply thread */}
            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conversation</h3>
              <ol className="mt-2 space-y-3">
                {(selected.replies ?? []).length === 0 && <li className="text-sm text-slate-400">No replies yet.</li>}
                {(selected.replies ?? []).map((r) => {
                  const mine = r.direction === "outbound";
                  const who = r.author === "user" ? "Customer" : r.author === "bot" ? "Bot (automatic)" : "You (human support)";
                  const tone = r.author === "user"
                    ? "bg-amber-50 text-slate-800"
                    : r.author === "bot"
                      ? "bg-violet-50 text-slate-800"
                      : "bg-sky-50 text-slate-800";
                  const { fresh, quoted } = splitQuoted(r.body || "");
                  return (
                    <li key={r.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${tone}`}>
                        <div className="text-xs font-medium text-slate-500">
                          {who} <span className="font-normal text-slate-400">· {fullTime(r.sentAt)}</span>
                        </div>
                        {r.subject && r.direction === "outbound" ? (
                          <div className="mt-0.5 text-xs text-slate-500">Subject: {r.subject}</div>
                        ) : null}
                        <div className="mt-1 whitespace-pre-wrap break-words"><Linkified text={fresh} /></div>
                        {quoted ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Show quoted text</summary>
                            <div className="mt-1 whitespace-pre-wrap break-words border-l-2 border-slate-300 pl-2 text-xs text-slate-500">{quoted}</div>
                          </details>
                        ) : null}
                        <AttachmentGallery items={r.attachments} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Internal notes: never emailed, never read or overwritten by the bots */}
            <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-3" aria-label="Internal notes">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Internal notes <span className="font-normal normal-case text-amber-700">(private, the customer never sees these)</span></h3>
              {notes.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No notes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                      <div className="text-xs text-slate-500">{n.authorEmail} · {fullTime(Date.parse(n.createdAt) || null)}</div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words"><Linkified text={n.body} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-2 block text-sm">
                <span className="sr-only">Add an internal note</span>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  maxLength={4000}
                  placeholder="Add a private note for the team..."
                  className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={!noteText.trim()}
                onClick={() => void saveNote()}
                className="mt-1 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                Add note
              </button>
            </section>

            {/* Triage controls */}
            <section className="mt-5 rounded-xl border border-slate-200 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Triage</h3>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="block text-xs text-slate-500">Priority</span>
                  <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-sm">
                    {["P0", "P1", "P2", "P3"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-slate-500">Status</span>
                  <select
                    value={selected.status}
                    onChange={(e) => doTriage({ status: e.target.value }, "Updating status…")}
                    className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex-1 text-sm">
                  <span className="block text-xs text-slate-500">Tags</span>
                  <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="deals, posting" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                </label>
                <button
                  type="button"
                  disabled={detailBusy}
                  onClick={() => doTriage({ priority: editPriority, tags: editTags.trim() }, "Saving…")}
                  className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ticketTags(selected).includes("human-owned") ? (
                  <button type="button" disabled={detailBusy} onClick={releaseToBot} title="Let the bot work this ticket again" className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50">Release to bot</button>
                ) : (
                  <button type="button" disabled={detailBusy} onClick={takeOver} title="Mark as yours: the sweep and autopilot will leave it alone" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Take over</button>
                )}
                <button type="button" disabled={detailBusy} onClick={() => doTriage({ status: "spam", classification: "spam" }, "Marking spam…")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Mark spam</button>
                <button type="button" disabled={detailBusy} onClick={() => doTriage({ status: "fixed" }, "Resolving…")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Resolve</button>
                <button type="button" disabled={detailBusy} onClick={() => doTriage({ status: "archived" }, "Archiving…")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Archive</button>
              </div>
            </section>

            {/* Reply */}
            <section
              className="mt-4 rounded-xl border border-slate-200 p-3"
              onDrop={selected.userEmail ? onReplyDrop : undefined}
              onDragOver={selected.userEmail ? (e) => e.preventDefault() : undefined}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reply to customer</h3>
              {selected.userEmail ? (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={suggesting || detailBusy}
                      onClick={doSuggest}
                      className="rounded-lg border border-[#f97316] px-3 py-1.5 text-sm font-medium text-[#c2410c] hover:bg-orange-50 disabled:opacity-50"
                    >
                      {suggesting ? "Drafting…" : "✨ Suggest reply"}
                    </button>
                    <span className="text-xs text-slate-400">AI drafts a grounded reply. You review and send.</span>
                  </div>
                  {suggestReason && <p className="mt-2 text-xs text-slate-500">{suggestReason}</p>}
                  {selected.requesterEmail && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                      This ticket was auto-filed from a call or chat. Your reply goes to the customer, <strong>{selected.requesterEmail}</strong>, not to the ticket owner.
                    </p>
                  )}
                  {activeDraft && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                      <span>
                        <strong>Bot draft loaded</strong>
                        {activeDraft.confidence != null ? ` (${Math.round(activeDraft.confidence * 100)}% sure` : " ("}
                        {activeDraft.grounded ? ", grounded in help articles)" : ", no help article match)"}. Edit it if needed, then Send reply.
                      </span>
                      <button type="button" onClick={() => void rejectDraft()} className="ml-auto rounded-lg border border-violet-300 bg-white px-2 py-0.5 font-medium text-violet-900 hover:bg-violet-100">Reject draft</button>
                    </div>
                  )}
                  <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="Subject" />
                  <textarea ref={replyRef} aria-label="Reply body" value={replyBody} onChange={(e) => setReplyBody(e.target.value)} onPaste={onReplyPaste} rows={6} className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder={"Hi,\n\nWarmly,\nYour Influencer Butler Team"} />

                  {/* Attach files / paste images */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Attach file
                    </button>
                    <span className="text-xs text-slate-400">Drag-drop files here, or paste an image to embed it in the email. Max 3 MB total.</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) void ingestFiles(files, "attachment");
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {replyAttachments.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {replyAttachments.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                          <span className="max-w-[180px] truncate" title={m.filename}>{m.filename}</span>
                          <span className="text-slate-400">{formatBytes(m.size)}</span>
                          <button type="button" onClick={() => removeAttachment(m.id)} aria-label={`Remove ${m.filename}`} className="text-slate-400 hover:text-rose-600">✕</button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {replyInlineImages.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500">Inline images (embedded in the email body):</p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {replyInlineImages.map((m) => (
                          <li key={m.id} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`data:${m.contentType};base64,${m.b64}`} alt={m.filename} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                            <button
                              type="button"
                              onClick={() => removeInlineImage(m.id)}
                              aria-label={`Remove ${m.filename}`}
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs text-slate-500 shadow-sm hover:text-rose-600"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {replyCanAdvance && (
                    <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={replyAdvance} onChange={(e) => setReplyAdvance(e.target.checked)} className="rounded border-slate-300" />
                      Move to waiting_on_user after sending
                    </label>
                  )}
                  <button type="button" disabled={detailBusy} onClick={doReply} className="mt-2 rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50">Send reply</button>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-400">This ticket was submitted anonymously, so there is no address to reply to.</p>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" onClick={() => setShowHelp(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Keyboard shortcuts</h2>
              <button type="button" onClick={() => setShowHelp(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              {([
                ["J / ↓", "Next ticket"],
                ["K / ↑", "Previous ticket"],
                ["Enter", "Open the highlighted ticket"],
                ["Esc", "Close drawer"],
                ["/", "Search"],
                ["R", "Reply (in a ticket)"],
                ["E", "Resolve (in a ticket)"],
                ["A", "Archive (in a ticket)"],
                ["Shift+S", "Mark spam (in a ticket)"],
                ["T", "Take over: bots stay out (in a ticket)"],
                ["H", "Show this help"],
              ] as const).map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dt><kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">{k}</kbd></dt>
                  <dd className="text-slate-600">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
