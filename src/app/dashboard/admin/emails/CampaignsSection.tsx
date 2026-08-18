"use client";

// Campaigns tab of the admin Emails page: list one-off campaigns with status
// and engagement stats, plus a composer for drafting, previewing the audience,
// test-sending, scheduling, and sending.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import CampaignDrawer from "./CampaignDrawer";

// Attachments / inline images the operator adds to a campaign. They travel as
// base64 in the save request and are stored on the campaign row. Caps mirror
// the server (src/lib/email-attachments.ts): stay under Vercel's ~4.5 MB body
// limit, so ~3 MB of raw files total.
type CampaignMedia = { id: string; filename: string; contentType: string; b64: string; size: number };
const MAX_ATTACHMENTS = 5;
const MAX_INLINE_IMAGES = 5;
const MAX_ITEM_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 3 * 1024 * 1024;

// Stored media shape on a campaign row: { filename, content (base64), contentType? }.
type StoredMedia = { filename: string; content: string; contentType?: string };

function readFileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Approx raw bytes from a base64 string, for sizing stored media on load. */
function b64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - pad;
}

function toMedia(stored: StoredMedia[] | undefined | null): CampaignMedia[] {
  return (stored ?? []).map((m, i) => ({
    id: `stored-${i}-${m.filename}`,
    filename: m.filename,
    contentType: m.contentType || "application/octet-stream",
    b64: m.content,
    size: b64Bytes(m.content),
  }));
}

type Audience =
  | { kind: "all_contacts" }
  | { kind: "tag"; tag: string }
  | { kind: "segment"; segment: "trial" | "pro" | "churned" | "newsletter" }
  | { kind: "pasted"; emails: string[] };

type CampaignCounts = { queued: number; sent: number; skipped: number; failed: number };

type Campaign = {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: Audience;
  status: "draft" | "sending" | "sent" | "cancelled";
  scheduled_at: string | null;
  materialized_at: string | null;
  created_at: string;
  sent_at: string | null;
  category: string;
  counts: CampaignCounts;
  attachments?: StoredMedia[] | null;
  inline_images?: StoredMedia[] | null;
};

type CampaignsResponse = { campaigns: Campaign[]; migrationPending: boolean };

type SummaryCategory = {
  key: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

type PreviewResponse = { count: number; sample: string[]; migrationPending: boolean };

const SEGMENT_LABELS: Record<string, string> = {
  trial: "Trial users",
  pro: "Pro subscribers",
  churned: "Churned customers",
  newsletter: "Newsletter subscribers",
};

const STATUS_BADGE: Record<Campaign["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  sending: "bg-sky-50 text-sky-700 animate-pulse",
  sent: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function audienceLabel(a: Audience): string {
  if (a.kind === "all_contacts") return "All contacts";
  if (a.kind === "tag") return `Tag: ${a.tag}`;
  if (a.kind === "segment") return `Segment: ${SEGMENT_LABELS[a.segment] ?? a.segment}`;
  return `Pasted list (${a.emails.length})`;
}

function parseEmails(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  );
}

export default function CampaignsSection({
  summary,
  onOpenCustomer,
}: {
  summary: { categories: SummaryCategory[] } | null;
  onOpenCustomer: (email: string) => void;
}) {
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Composer state. draftId tracks the persisted campaign id once a "new"
  // draft has been saved, so follow-up saves PATCH instead of POSTing again.
  const [editing, setEditing] = useState<null | "new" | Campaign>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audienceKind, setAudienceKind] = useState<Audience["kind"]>("all_contacts");
  const [audienceTag, setAudienceTag] = useState("");
  const [audienceSegment, setAudienceSegment] = useState<
    "trial" | "pro" | "churned" | "newsletter"
  >("trial");
  const [pastedText, setPastedText] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [attachments, setAttachments] = useState<CampaignMedia[]>([]);
  const [inlineImages, setInlineImages] = useState<CampaignMedia[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/emails/campaigns", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(`Could not load campaigns (HTTP ${res.status}).`);
        return;
      }
      setData((await res.json()) as CampaignsResponse);
    } catch {
      setLoadError("Could not load campaigns. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function buildAudience(): Audience {
    if (audienceKind === "tag") return { kind: "tag", tag: audienceTag.trim() };
    if (audienceKind === "segment") return { kind: "segment", segment: audienceSegment };
    if (audienceKind === "pasted") return { kind: "pasted", emails: parseEmails(pastedText) };
    return { kind: "all_contacts" };
  }

  // Read dropped/picked/pasted files into base64 media, enforcing the same caps
  // the server re-checks. `attachment` files download; `inline` images embed in
  // the email body.
  const ingestFiles = useCallback(
    async (files: File[], kind: "attachment" | "inline") => {
      if (!files.length) return;
      const existing = kind === "attachment" ? attachments : inlineImages;
      const max = kind === "attachment" ? MAX_ATTACHMENTS : MAX_INLINE_IMAGES;
      let runningTotal = [...attachments, ...inlineImages].reduce((n, m) => n + m.size, 0);
      const added: CampaignMedia[] = [];
      for (const file of files) {
        if (kind === "inline" && !file.type.startsWith("image/")) continue;
        if (existing.length + added.length >= max) {
          setComposerError(`You can add at most ${max} ${kind === "attachment" ? "files" : "images"}.`);
          break;
        }
        if (file.size > MAX_ITEM_BYTES) {
          setComposerError(`"${file.name}" is too large (max 3 MB per file).`);
          continue;
        }
        if (runningTotal + file.size > MAX_TOTAL_MEDIA_BYTES) {
          setComposerError("Attachments are too large together (max 3 MB total).");
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
          setComposerError(`Could not read "${file.name}".`);
        }
      }
      if (added.length) {
        if (kind === "attachment") setAttachments((p) => [...p, ...added]);
        else setInlineImages((p) => [...p, ...added]);
      }
    },
    [attachments, inlineImages],
  );

  const onBodyPaste = useCallback(
    (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
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
    },
    [ingestFiles],
  );

  const onComposerDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      e.preventDefault();
      void ingestFiles(files, "attachment");
    },
    [ingestFiles],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((p) => p.filter((m) => m.id !== id));
  }, []);
  const removeInlineImage = useCallback((id: string) => {
    setInlineImages((p) => p.filter((m) => m.id !== id));
  }, []);

  // Debounced audience preview whenever the audience inputs change while the
  // composer is open.
  useEffect(() => {
    if (editing === null) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const audience: Audience =
      audienceKind === "tag"
        ? { kind: "tag", tag: audienceTag.trim() }
        : audienceKind === "segment"
          ? { kind: "segment", segment: audienceSegment }
          : audienceKind === "pasted"
            ? { kind: "pasted", emails: parseEmails(pastedText) }
            : { kind: "all_contacts" };
    previewTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/emails/audience-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audience }),
          });
          if (!res.ok) return;
          setPreview((await res.json()) as PreviewResponse);
        } catch {
          // preview stays stale; not fatal
        }
      })();
    }, 500);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [editing, audienceKind, audienceTag, audienceSegment, pastedText]);

  function openComposer(campaign: "new" | Campaign) {
    setEditing(campaign);
    setDraftId(campaign === "new" ? null : campaign.id);
    setComposerError(null);
    setComposerNotice(null);
    setPreview(null);
    setTestEmail("");
    setScheduleAt("");
    if (campaign === "new") {
      setName("");
      setSubject("");
      setBody("");
      setAudienceKind("all_contacts");
      setAudienceTag("");
      setAudienceSegment("trial");
      setPastedText("");
      setAttachments([]);
      setInlineImages([]);
    } else {
      setName(campaign.name);
      setSubject(campaign.subject);
      setBody(campaign.body);
      const a = campaign.audience;
      setAudienceKind(a.kind);
      setAudienceTag(a.kind === "tag" ? a.tag : "");
      setAudienceSegment(a.kind === "segment" ? a.segment : "trial");
      setPastedText(a.kind === "pasted" ? a.emails.join("\n") : "");
      setAttachments(toMedia(campaign.attachments));
      setInlineImages(toMedia(campaign.inline_images));
    }
  }

  /** Save the draft (POST for new, PATCH update for existing). Returns the
   * campaign id, or null on failure. */
  async function saveDraft(): Promise<string | null> {
    setComposerBusy(true);
    setComposerError(null);
    setComposerNotice(null);
    try {
      const audience = buildAudience();
      const mediaPayload = {
        attachments: attachments.map((m) => ({ filename: m.filename, content: m.b64, contentType: m.contentType })),
        inlineImages: inlineImages.map((m) => ({ filename: m.filename, content: m.b64, contentType: m.contentType })),
      };
      if (draftId === null) {
        const res = await fetch("/api/admin/emails/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, subject, body, audience, ...mediaPayload }),
        });
        if (!res.ok) {
          setComposerError(await readError(res, "Could not save the draft"));
          return null;
        }
        const { id, mediaUnsaved } = (await res.json()) as { ok: boolean; id: string; mediaUnsaved?: boolean };
        setDraftId(id);
        if (mediaUnsaved) {
          setComposerError("Draft saved, but attachments could not be stored: apply the 20260818_email_campaign_attachments migration to prod.");
        }
        return id;
      }
      const res = await fetch("/api/admin/emails/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draftId, action: "update", name, subject, body, audience, ...mediaPayload }),
      });
      if (!res.ok) {
        setComposerError(await readError(res, "Could not save the draft"));
        return null;
      }
      const { mediaUnsaved } = (await res.json()) as { ok: boolean; mediaUnsaved?: boolean };
      if (mediaUnsaved) {
        setComposerError("Draft saved, but attachments could not be stored: apply the 20260818_email_campaign_attachments migration to prod.");
      }
      return draftId;
    } catch {
      setComposerError("Could not save the draft. Check your connection and try again.");
      return null;
    } finally {
      setComposerBusy(false);
    }
  }

  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) return data.error;
    } catch {
      // fall through to the generic message
    }
    return `${fallback} (HTTP ${res.status}).`;
  }

  async function handleSaveDraft() {
    const id = await saveDraft();
    if (id) {
      setComposerNotice("Draft saved.");
      void refetch();
    }
  }

  async function draftAction(
    action: "send" | "schedule" | "test",
    extra: Record<string, unknown> = {},
  ) {
    // Persist the latest edits first so the action applies to what's on screen.
    const id = await saveDraft();
    if (!id) return;
    setComposerBusy(true);
    setComposerError(null);
    setComposerNotice(null);
    try {
      const res = await fetch("/api/admin/emails/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      if (!res.ok) {
        setComposerError(await readError(res, "Action failed"));
        return;
      }
      if (action === "test") {
        setComposerNotice(`Test email sent to ${String(extra.toEmail)}.`);
      } else {
        setEditing(null);
        void refetch();
      }
    } catch {
      setComposerError("Action failed. Check your connection and try again.");
    } finally {
      setComposerBusy(false);
    }
  }

  async function listAction(campaign: Campaign, action: "cancel" | "duplicate") {
    if (
      action === "cancel" &&
      !window.confirm(`Cancel "${campaign.name}"? Queued sends will not go out.`)
    ) {
      return;
    }
    setListError(null);
    try {
      const res = await fetch("/api/admin/emails/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, action }),
      });
      if (!res.ok) {
        setListError(await readError(res, "Action failed"));
        return;
      }
      void refetch();
    } catch {
      setListError("Action failed. Check your connection and try again.");
    }
  }

  function statsFor(campaign: Campaign): { open: string; click: string } {
    const cat = summary?.categories.find((c) => c.key === campaign.category);
    if (!cat) return { open: "-", click: "-" };
    const base = Math.max(cat.delivered, cat.sent);
    return { open: pct(cat.opened, base), click: pct(cat.clicked, base) };
  }

  const campaigns = data?.campaigns ?? [];
  const anySending = campaigns.some((c) => c.status === "sending");

  // ----- Composer view -----
  if (editing !== null) {
    return (
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {editing === "new" ? "New campaign" : `Edit: ${editing.name}`}
          </h2>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Back
          </button>
        </div>

        <div
          className="mt-3 rounded-xl border border-slate-200 bg-white p-4"
          onDrop={onComposerDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">Name (internal)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="August feature announcement"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line your readers will see"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={onBodyPaste}
              rows={14}
              placeholder="Write the email body..."
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />

            {/* Attachments + inline images */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Attach file
              </button>
              <span className="text-xs text-slate-400">
                Drag-drop files here, or paste an image to embed it in the email. Max 3 MB total.
              </span>
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

            {attachments.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {attachments.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                  >
                    <span className="max-w-[180px] truncate" title={m.filename}>
                      {m.filename}
                    </span>
                    <span className="text-slate-400">{fmtBytes(m.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(m.id)}
                      aria-label={`Remove ${m.filename}`}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {inlineImages.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs text-slate-500">Inline images (embedded in the email body):</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {inlineImages.map((m) => (
                    <li key={m.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${m.contentType};base64,${m.b64}`}
                        alt={m.filename}
                        className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                      />
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
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">Audience</label>
              <select
                value={audienceKind}
                onChange={(e) => setAudienceKind(e.target.value as Audience["kind"])}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
              >
                <option value="all_contacts">All contacts</option>
                <option value="tag">Tag</option>
                <option value="segment">Customer segment</option>
                <option value="pasted">Pasted list</option>
              </select>
            </div>
            <div>
              {audienceKind === "tag" ? (
                <>
                  <label className="text-xs font-medium text-slate-500">Tag</label>
                  <input
                    type="text"
                    value={audienceTag}
                    onChange={(e) => setAudienceTag(e.target.value)}
                    placeholder="vip"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                </>
              ) : null}
              {audienceKind === "segment" ? (
                <>
                  <label className="text-xs font-medium text-slate-500">Segment</label>
                  <select
                    value={audienceSegment}
                    onChange={(e) =>
                      setAudienceSegment(
                        e.target.value as "trial" | "pro" | "churned" | "newsletter",
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
                  >
                    <option value="trial">Trial users</option>
                    <option value="pro">Pro subscribers</option>
                    <option value="churned">Churned customers</option>
                    <option value="newsletter">Newsletter subscribers</option>
                  </select>
                </>
              ) : null}
            </div>
          </div>

          {audienceKind === "pasted" ? (
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-500">Pasted addresses</label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={5}
                placeholder="Paste emails separated by commas, spaces, or new lines..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                {parseEmails(pastedText).length} address(es) detected.
              </p>
            </div>
          ) : null}

          {preview ? (
            <p className="mt-3 text-sm text-slate-500">
              Will send to {preview.count.toLocaleString("en-US")} people
              {preview.sample.length > 0 ? (
                <span className="text-xs text-slate-400">
                  {" "}
                  ({preview.sample.slice(0, 3).join(", ")}
                  {preview.count > 3 ? ", ..." : ""})
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={composerBusy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Save draft
            </button>

            <span className="mx-1 h-6 w-px bg-slate-200" />

            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void draftAction("test", { toEmail: testEmail.trim() })}
              disabled={composerBusy || testEmail.trim().length === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Send test
            </button>

            <span className="mx-1 h-6 w-px bg-slate-200" />

            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!scheduleAt) {
                  setComposerError("Pick a date and time to schedule.");
                  return;
                }
                void draftAction("schedule", {
                  scheduledAt: new Date(scheduleAt).toISOString(),
                });
              }}
              disabled={composerBusy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Schedule
            </button>

            <span className="mx-1 h-6 w-px bg-slate-200" />

            <button
              type="button"
              onClick={() => {
                const n = preview ? preview.count.toLocaleString("en-US") : "?";
                if (window.confirm(`Send to ~${n} people? Sending starts within 5 minutes.`)) {
                  void draftAction("send");
                }
              }}
              disabled={composerBusy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              Send now
            </button>
          </div>

          {composerError ? <p className="mt-3 text-sm text-rose-600">{composerError}</p> : null}
          {composerNotice ? (
            <p className="mt-3 text-sm text-emerald-700">{composerNotice}</p>
          ) : null}
        </div>
      </section>
    );
  }

  // ----- List view -----
  return (
    <section className="mt-6">
      {data?.migrationPending ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The email marketing tables are missing. Apply
          supabase/migrations/20260817_email_marketing.sql to prod to enable contacts, campaigns,
          and sequences.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Campaigns</h2>
        <button
          type="button"
          onClick={() => openComposer("new")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          New campaign
        </button>
      </div>

      {loadError ? <p className="mt-3 text-sm text-rose-600">{loadError}</p> : null}
      {listError ? <p className="mt-3 text-sm text-rose-600">{listError}</p> : null}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Audience</th>
              <th className="px-4 py-2.5 text-right font-medium">Recipients</th>
              <th className="px-4 py-2.5 text-right font-medium">Open %</th>
              <th className="px-4 py-2.5 text-right font-medium">Click %</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const stats = statsFor(c);
              const totalQueued = c.counts.queued + c.counts.sent + c.counts.skipped + c.counts.failed;
              return (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="max-w-xs truncate px-4 py-2 font-medium text-slate-800">
                    <button
                      type="button"
                      onClick={() => setDetailId(c.id)}
                      className="text-left hover:text-indigo-600"
                      title="View campaign details"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{audienceLabel(c.audience)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {totalQueued > 0
                      ? `${c.counts.sent.toLocaleString("en-US")}/${totalQueued.toLocaleString("en-US")}`
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-indigo-600">
                    {stats.open}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-sky-600">{stats.click}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                    {fmtDate(c.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap gap-2 text-xs">
                      {c.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => openComposer(c)}
                          className="text-slate-600 underline underline-offset-2 hover:text-indigo-600"
                        >
                          Edit
                        </button>
                      ) : null}
                      {c.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => openComposer(c)}
                          className="text-indigo-600 underline underline-offset-2 hover:text-indigo-500"
                        >
                          Send
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void listAction(c, "duplicate")}
                        className="text-slate-600 underline underline-offset-2 hover:text-indigo-600"
                      >
                        Duplicate
                      </button>
                      {c.status === "draft" || c.status === "sending" ? (
                        <button
                          type="button"
                          onClick={() => void listAction(c, "cancel")}
                          className="text-rose-600 underline underline-offset-2 hover:text-rose-500"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No campaigns yet. Create one to email your contacts.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {loading ? <div className="h-24 animate-pulse bg-slate-50" /> : null}
      </div>

      {anySending ? (
        <p className="mt-2 text-xs text-slate-500">
          Sending campaigns are processed in batches every 5 minutes.
        </p>
      ) : null}

      {detailId ? (
        <CampaignDrawer
          campaignId={detailId}
          onClose={() => setDetailId(null)}
          onOpenCustomer={(email) => {
            onOpenCustomer(email);
            setDetailId(null);
          }}
        />
      ) : null}
    </section>
  );
}
