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

type Reply = {
  id: number | string;
  direction: "outbound" | "inbound";
  author: "bot" | "user" | "human-support";
  subject: string;
  body: string;
  sentAt: number | null;
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Bucket = { key: string; label: string; statuses: string[] };

const BUCKETS: Bucket[] = [
  { key: "attention", label: "Needs attention", statuses: ["escalated", "user_replied", "waiting_on_user"] },
  { key: "new", label: "New", statuses: ["sent"] },
  { key: "inProgress", label: "In progress", statuses: ["acked", "clarifying", "patching", "committed", "released"] },
  { key: "resolved", label: "Resolved", statuses: ["fixed"] },
  { key: "spam", label: "Spam", statuses: ["spam"] },
  { key: "archived", label: "Archived", statuses: ["archived"] },
  { key: "all", label: "All", statuses: [] },
];

const PRIORITIES = ["", "P0", "P1", "P2", "P3"];

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

export default function SupportAdminPage() {
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const [bucket, setBucket] = useState<string>("attention");
  const [priority, setPriority] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [q, setQ] = useState<string>("");

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

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (activeBucket.statuses.length) qs.set("statuses", activeBucket.statuses.join(","));
      if (priority) qs.set("priority", priority);
      if (tier.trim()) qs.set("tier", tier.trim());
      if (q.trim()) qs.set("q", q.trim());
      qs.set("limit", "100");
      const res = await fetch(`/api/admin/support/list?${qs.toString()}`, { cache: "no-store" });
      if (res.status === 403) { setForbidden(true); return; }
      const json = (await res.json()) as { tickets?: Ticket[]; error?: string };
      if (!res.ok) { setError(json.error || "Failed to load"); setTickets([]); return; }
      setTickets(json.tickets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [activeBucket, priority, tier, q]);

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
    } finally {
      setDetailBusy(false);
    }
  }, []);

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
        .filter((t) => (t.userEmail || "").toLowerCase() === target)
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
          ...(replyAttachments.length
            ? { attachments: replyAttachments.map((m) => ({ filename: m.filename, content: m.b64, contentType: m.contentType })) }
            : {}),
          ...(replyInlineImages.length
            ? { inlineImages: replyInlineImages.map((m) => ({ filename: m.filename, content: m.b64, contentType: m.contentType })) }
            : {}),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setActionMsg(json.error || "Reply failed"); return; }
      setActionMsg("Reply sent.");
      setReplyBody("");
      setReplyAttachments([]);
      setReplyInlineImages([]);
      await Promise.all([openTicket(selected.id), fetchList(), fetchCounts()]);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setDetailBusy(false);
    }
  }, [selected, replySubject, replyBody, replyAdvance, replyAttachments, replyInlineImages, openTicket, fetchList, fetchCounts]);

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
          onClick={() => { fetchList(); fetchCounts(); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

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
                bucket === b.key ? "bg-[#f97316] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {b.label}
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
        <input
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          placeholder="Tier (e.g. growth)"
          className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title / text / email"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
        />
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
              <th className="px-3 py-2">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No tickets in this view.</td></tr>
            ) : (
              tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className={`cursor-pointer hover:bg-slate-50 ${selected?.id === t.id ? "bg-orange-50/50" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-400" title={t.id}>{t.id}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${priorityClasses(t.priority)}`}>{t.priority || "P2"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusClasses(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.classification || t.type}</td>
                  <td className="px-3 py-2 text-slate-900">{t.title || "(no title)"}</td>
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
                  <td className="px-3 py-2 text-slate-500">{ago(t.submittedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>

            {actionMsg && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-600">{actionMsg}</div>}

            {/* Release / handling state banner */}
            {(() => { const rs = releaseState(selected); return (
              <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${rs.tone}`}>{rs.text}</div>
            ); })()}

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
              <ol className="mt-1 space-y-2">
                {(selected.replies ?? []).length === 0 && <li className="text-sm text-slate-400">No replies yet.</li>}
                {(selected.replies ?? []).map((r) => (
                  <li key={r.id} className={`rounded-lg p-2 text-sm ${r.direction === "inbound" ? "bg-amber-50" : "bg-slate-50"}`}>
                    <div className="text-xs text-slate-400">{r.direction} · {r.author} · {fullTime(r.sentAt)}</div>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{r.body}</pre>
                  </li>
                ))}
              </ol>
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
                  <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="daily-deals, posting" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
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
                <button type="button" disabled={detailBusy} onClick={() => doTriage({ status: "escalated", escalatedReason: "Taken over from the dashboard" }, "Taking over…")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Take over</button>
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
                  <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="Subject" />
                  <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} onPaste={onReplyPaste} rows={6} className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder={"Hi,\n\nWarmly,\nYour Influencer Butler Team"} />

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
    </div>
  );
}
