"use client";

import { useCallback, useEffect, useState } from "react";

type BannerSurface = "web" | "extension" | "desktop";

type AdminEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  joinUrl: string | null;
  meetingProvider: string | null;
  recordEnabled: boolean;
  recordingStatus: string;
  recordingUrl: string | null;
  bannerEnabled: boolean;
  bannerText: string | null;
  bannerCtaLabel: string | null;
  bannerStartsAt: string | null;
  bannerEndsAt: string | null;
  bannerSurfaces: BannerSurface[];
  imageUrl: string | null;
  youtubeStatus: string;
  youtubeUrl: string | null;
  youtubeError: string | null;
  registrations: number;
  // Email lifecycle (null when the 20260917 migration is not applied yet).
  inviteCampaignId: string | null;
  inviteDaysBefore: number | null;
  replayHoursAfter: number | null;
  replaySubject: string | null;
  replayBody: string | null;
  replayEmailedAt: string | null;
};

// Audience choices offered for the invite campaign. "engaged" is the warm
// re-engagement cohort (opened more than N of our emails, not unsubscribed).
type InviteAudienceKind = "all_contacts" | "pro" | "trial" | "engaged" | "tag" | "pasted";

type FormState = {
  id: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recordEnabled: boolean;
  joinUrl: string;
  bannerEnabled: boolean;
  bannerText: string;
  bannerCtaLabel: string;
  bannerStartsAt: string;
  bannerEndsAt: string;
  bannerSurfaces: BannerSurface[];
  // Invite campaign (auto-scheduled N days before the event).
  inviteEnabled: boolean;
  inviteAudienceKind: InviteAudienceKind;
  inviteTag: string;
  invitePasted: string;
  inviteMinOpens: number;
  inviteDaysBefore: number;
  inviteSubject: string;
  inviteBody: string;
  // Replay follow-up (sent hoursAfter the event ends, once a replay exists).
  replayEnabled: boolean;
  replayHoursAfter: number;
  replaySubject: string;
  replayBody: string;
};

const ALL_SURFACES: BannerSurface[] = ["web", "extension", "desktop"];

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver";
  } catch {
    return "America/Denver";
  }
}

/** ISO -> value for a <input type="datetime-local"> in the browser's local tz. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (browser-local wall clock) -> ISO, or "" if empty. */
function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function emptyForm(): FormState {
  return {
    id: null,
    title: "",
    description: "",
    startsAt: "",
    endsAt: "",
    timezone: browserTz(),
    recordEnabled: true,
    joinUrl: "",
    bannerEnabled: false,
    bannerText: "",
    bannerCtaLabel: "Register",
    bannerStartsAt: "",
    bannerEndsAt: "",
    bannerSurfaces: [...ALL_SURFACES],
    inviteEnabled: false,
    inviteAudienceKind: "pro",
    inviteTag: "",
    invitePasted: "",
    inviteMinOpens: 2,
    inviteDaysBefore: 7,
    inviteSubject: "",
    inviteBody: "",
    replayEnabled: true,
    replayHoursAfter: 3,
    replaySubject: "",
    replayBody: "",
  };
}

/** Builds the invite audience object the API expects from the form fields. */
function buildInviteAudience(f: FormState): Record<string, unknown> {
  switch (f.inviteAudienceKind) {
    case "pro":
      return { kind: "segment", segment: "pro" };
    case "trial":
      return { kind: "segment", segment: "trial" };
    case "engaged":
      return { kind: "engaged", minOpens: f.inviteMinOpens };
    case "tag":
      return { kind: "tag", tag: f.inviteTag.trim() };
    case "pasted":
      return {
        kind: "pasted",
        emails: f.invitePasted
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
    default:
      return { kind: "all_contacts" };
  }
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [imagingId, setImagingId] = useState<string | null>(null);
  const [rearmingId, setRearmingId] = useState<string | null>(null);
  const [youtubingId, setYoutubingId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events/list", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { events?: AdminEvent[] };
      setEvents(data.events ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const startEdit = (e: AdminEvent) => {
    setForm({
      id: e.id,
      title: e.title,
      description: e.description ?? "",
      startsAt: toLocalInput(e.startsAt),
      endsAt: toLocalInput(e.endsAt),
      timezone: e.timezone,
      recordEnabled: e.recordEnabled,
      joinUrl: e.joinUrl ?? "",
      bannerEnabled: e.bannerEnabled,
      bannerText: e.bannerText ?? "",
      bannerCtaLabel: e.bannerCtaLabel ?? "Register",
      bannerStartsAt: toLocalInput(e.bannerStartsAt),
      bannerEndsAt: toLocalInput(e.bannerEndsAt),
      bannerSurfaces: e.bannerSurfaces.length ? e.bannerSurfaces : [...ALL_SURFACES],
      // Invite is create-only per event (guarded server-side against duplicates);
      // on edit we default it off and surface the existing scheduled campaign.
      inviteEnabled: false,
      inviteAudienceKind: "pro",
      inviteTag: "",
      invitePasted: "",
      inviteMinOpens: 2,
      inviteDaysBefore: e.inviteDaysBefore ?? 7,
      inviteSubject: "",
      inviteBody: "",
      replayEnabled: e.replayHoursAfter !== null,
      replayHoursAfter: e.replayHoursAfter ?? 3,
      replaySubject: e.replaySubject ?? "",
      replayBody: e.replayBody ?? "",
    });
    setMessage(null);
    setDraftNote(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSurface = (s: BannerSurface) => {
    setForm((f) => ({
      ...f,
      bannerSurfaces: f.bannerSurfaces.includes(s)
        ? f.bannerSurfaces.filter((x) => x !== s)
        : [...f.bannerSurfaces, s],
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const payload = {
      id: form.id ?? undefined,
      title: form.title,
      description: form.description,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      timezone: form.timezone,
      recordEnabled: form.recordEnabled,
      joinUrl: form.joinUrl,
      banner: {
        enabled: form.bannerEnabled,
        text: form.bannerText,
        ctaLabel: form.bannerCtaLabel,
        startsAt: fromLocalInput(form.bannerStartsAt),
        endsAt: fromLocalInput(form.bannerEndsAt),
        surfaces: form.bannerSurfaces,
      },
      // Only send an invite plan when the operator opted in, so an unrelated
      // edit never schedules a campaign.
      ...(form.inviteEnabled
        ? {
            invite: {
              enabled: true,
              audience: buildInviteAudience(form),
              daysBefore: form.inviteDaysBefore,
              subject: form.inviteSubject,
              body: form.inviteBody,
            },
          }
        : {}),
      replay: {
        enabled: form.replayEnabled,
        hoursAfter: form.replayHoursAfter,
        subject: form.replaySubject,
        body: form.replayBody,
      },
    };
    try {
      const url = form.id ? "/api/admin/events/update" : "/api/admin/events/create";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        joinUrl?: string | null;
      };
      if (!res.ok) {
        setMessage(data.error || "Could not save.");
        return;
      }
      const savedId = form.id ?? data.id ?? null;
      setMessage(form.id ? "Event updated." : "Event scheduled.");
      setForm(emptyForm());
      setDraftNote(null);
      await refetch();
      // Auto-generate the branded cover image (title + date + time) as a
      // follow-up step so saving stays fast. Best-effort: never blocks.
      if (savedId) void generateImage(savedId);
    } finally {
      setSaving(false);
    }
  };

  // Phase 3: draft the description + invite/replay email copy with AI from the
  // title + time (and the description box used as a rough brief). Fills the form
  // for review; nothing is saved until the operator clicks Schedule.
  const draftWithAi = async () => {
    if (!form.title.trim() || !form.startsAt || !form.endsAt) {
      setDraftNote("Add a title, a start time, and an end time first, then Draft with AI.");
      return;
    }
    const startIso = fromLocalInput(form.startsAt);
    const endIso = fromLocalInput(form.endsAt);
    if (!startIso || !endIso || Date.parse(endIso) <= Date.parse(startIso)) {
      setDraftNote("The end time must be after the start time. Check the Ends date.");
      return;
    }
    setDrafting(true);
    setDraftNote("Drafting with AI, this takes a few seconds...");
    try {
      const res = await fetch("/api/admin/events/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          startsAt: fromLocalInput(form.startsAt),
          endsAt: fromLocalInput(form.endsAt),
          timezone: form.timezone,
          notes: form.description,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        draft?: {
          description?: string;
          inviteSubject?: string;
          inviteBody?: string;
          replaySubject?: string;
          replayBody?: string;
        };
      };
      if (!res.ok || !data.draft) {
        setDraftNote(data.error || "Could not draft. Try again.");
        return;
      }
      const d = data.draft;
      setForm((f) => ({
        ...f,
        description: d.description || f.description,
        inviteEnabled: true,
        inviteSubject: d.inviteSubject || "",
        inviteBody: d.inviteBody || "",
        replayEnabled: true,
        replaySubject: d.replaySubject || "",
        replayBody: d.replayBody || "",
      }));
      setDraftNote("Draft ready below. Review the copy, pick an invite audience, then Schedule.");
    } catch {
      setDraftNote("Could not reach the drafter. Check your connection and try again.");
    } finally {
      setDrafting(false);
    }
  };

  const generateImage = async (id: string) => {
    setImagingId(id);
    setMessage("Generating event image...");
    try {
      const res = await fetch("/api/admin/events/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(res.ok ? "Event image ready." : data.error || "Could not generate the image.");
      await refetch();
    } finally {
      setImagingId(null);
    }
  };

  const queueYouTube = async (id: string) => {
    setYoutubingId(id);
    setMessage("Queuing YouTube upload...");
    try {
      const res = await fetch("/api/admin/events/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      setMessage(res.ok ? data.message || "Queued for YouTube upload." : data.error || "Could not queue the upload.");
      await refetch();
    } finally {
      setYoutubingId(null);
    }
  };

  const cancelEvent = async (id: string) => {
    if (!window.confirm("Cancel this event? Registrants keep their RSVP but the banner and reminders stop.")) return;
    const res = await fetch("/api/admin/events/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await refetch();
  };

  const rearmRecording = async (id: string) => {
    setRearmingId(id);
    setMessage("Retrying recording...");
    try {
      const res = await fetch("/api/admin/events/rearm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(res.ok ? "Recording re-armed." : data.error || "Could not re-arm recording.");
      await refetch();
    } finally {
      setRearmingId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">Events</h1>
        <p className="mt-4 text-sm text-rose-700">You do not have permission to manage events.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Events</h1>
      <p className="mt-1 text-sm text-slate-600">
        Schedule group calls, control the cross-app banner (web, extension, desktop), and see who
        registered. Enter times in your local timezone ({browserTz()}).
      </p>

      {/* Create / edit form */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {form.id ? "Edit event" : "Schedule an event"}
          </h2>
          {!form.id ? (
            <button
              type="button"
              onClick={draftWithAi}
              disabled={drafting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              title="Draft the description and invite/replay emails from the title and time"
            >
              {drafting ? "Drafting..." : "Draft with AI"}
            </button>
          ) : null}
        </div>
        {!form.id ? (
          <p className="mt-1 text-xs text-slate-500">
            Fill in the title and times, add a rough brief in the description if you like, then
            Draft with AI to write the description and the invite + replay emails for you to review.
          </p>
        ) : null}
        {!form.id && draftNote ? (
          <p className="mt-1 text-xs font-medium text-emerald-800">{draftNote}</p>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Prime Big Deals Day strategy call"
            />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="What the call covers, who it is for, what to bring."
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Starts</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Ends</span>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Display timezone</span>
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="America/Denver"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Join link (optional)</span>
            <input
              type="url"
              value={form.joinUrl}
              onChange={(e) => setForm({ ...form, joinUrl: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Leave blank to auto-create a Google Meet"
            />
          </label>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.recordEnabled}
              onChange={(e) => setForm({ ...form, recordEnabled: e.target.checked })}
            />
            <span className="text-slate-700">
              Record + transcribe, and email an AI recap to registrants afterward (Google Meet only)
            </span>
          </label>
        </div>

        {/* Banner block */}
        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <input
              type="checkbox"
              checked={form.bannerEnabled}
              onChange={(e) => setForm({ ...form, bannerEnabled: e.target.checked })}
            />
            Push a banner notice for this event
          </label>
          {form.bannerEnabled ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Banner text (max 280 chars)</span>
                <textarea
                  value={form.bannerText}
                  onChange={(e) => setForm({ ...form, bannerText: e.target.value })}
                  rows={2}
                  maxLength={280}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Join our Prime Big Deals Day strategy call, Thursday at 11am MT."
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Button label</span>
                <input
                  type="text"
                  value={form.bannerCtaLabel}
                  onChange={(e) => setForm({ ...form, bannerCtaLabel: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Register"
                />
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Show on</span>
                <div className="flex flex-wrap gap-3 pt-1">
                  {ALL_SURFACES.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm capitalize text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.bannerSurfaces.includes(s)}
                        onChange={() => toggleSurface(s)}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Banner shows from (optional)</span>
                <input
                  type="datetime-local"
                  value={form.bannerStartsAt}
                  onChange={(e) => setForm({ ...form, bannerStartsAt: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Banner shows until (optional)</span>
                <input
                  type="datetime-local"
                  value={form.bannerEndsAt}
                  onChange={(e) => setForm({ ...form, bannerEndsAt: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <p className="sm:col-span-2 text-xs text-slate-500">
                Leave the window blank to show the banner until the event ends. The extension shows
                the text in its popup notice; the desktop app polls the announcements feed.
              </p>
            </div>
          ) : null}
        </div>

        {/* Email plan block: auto-invite ahead of time + replay follow-up. The
            24h/1h reminders to registrants are always automatic. */}
        <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-emerald-900">Email plan</p>
          <p className="mt-0.5 text-xs text-emerald-800/80">
            Registrants always get automatic 24h and 1h reminders. Set up the invite and the replay
            follow-up here.
          </p>

          {/* Invite */}
          {form.id && form.id.length > 0 ? (
            <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600">
              Invite campaigns are set at creation. Manage or resend from Emails &gt; Campaigns.
            </p>
          ) : (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={form.inviteEnabled}
                  onChange={(e) => setForm({ ...form, inviteEnabled: e.target.checked })}
                />
                Schedule an invite email to drive registrations
              </label>
              {form.inviteEnabled ? (
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Audience</span>
                    <select
                      value={form.inviteAudienceKind}
                      onChange={(e) =>
                        setForm({ ...form, inviteAudienceKind: e.target.value as InviteAudienceKind })
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value="pro">Pro members</option>
                      <option value="trial">Trial members</option>
                      <option value="engaged">Engaged openers (opened more than N)</option>
                      <option value="tag">Contacts with a tag</option>
                      <option value="all_contacts">All contacts</option>
                      <option value="pasted">Pasted list</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Send this many days before</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={form.inviteDaysBefore}
                      onChange={(e) =>
                        setForm({ ...form, inviteDaysBefore: Number(e.target.value) || 0 })
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  {form.inviteAudienceKind === "engaged" ? (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-slate-700">Opened more than</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={form.inviteMinOpens}
                        onChange={(e) =>
                          setForm({ ...form, inviteMinOpens: Number(e.target.value) || 2 })
                        }
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  ) : null}
                  {form.inviteAudienceKind === "tag" ? (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-slate-700">Tag</span>
                      <input
                        type="text"
                        value={form.inviteTag}
                        onChange={(e) => setForm({ ...form, inviteTag: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="cold-ig-amazon"
                      />
                    </label>
                  ) : null}
                  {form.inviteAudienceKind === "pasted" ? (
                    <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                      <span className="font-medium text-slate-700">Emails (comma or newline separated)</span>
                      <textarea
                        value={form.invitePasted}
                        onChange={(e) => setForm({ ...form, invitePasted: e.target.value })}
                        rows={2}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  ) : null}
                  <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Invite subject (optional)</span>
                    <input
                      type="text"
                      value={form.inviteSubject}
                      onChange={(e) => setForm({ ...form, inviteSubject: e.target.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Auto: You are invited: <event title>"
                    />
                  </label>
                  <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Invite body (optional)</span>
                    <textarea
                      value={form.inviteBody}
                      onChange={(e) => setForm({ ...form, inviteBody: e.target.value })}
                      rows={3}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Use {{EVENT_URL}} where the register link should go. Leave blank to auto-write from the title, time, and description."
                    />
                  </label>
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    This creates a scheduled draft in Emails &gt; Campaigns (sent{" "}
                    {form.inviteDaysBefore} day{form.inviteDaysBefore === 1 ? "" : "s"} before, or at
                    least an hour from now if the event is sooner). You can review, edit, or cancel it
                    there before it sends.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* Replay follow-up */}
          <div className="mt-4 border-t border-emerald-100 pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={form.replayEnabled}
                onChange={(e) => setForm({ ...form, replayEnabled: e.target.checked })}
              />
              Send a replay follow-up to registrants after the event
            </label>
            {form.replayEnabled ? (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Hours after it ends</span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={form.replayHoursAfter}
                    onChange={(e) =>
                      setForm({ ...form, replayHoursAfter: Number(e.target.value) || 3 })
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Replay subject (optional)</span>
                  <input
                    type="text"
                    value={form.replaySubject}
                    onChange={(e) => setForm({ ...form, replaySubject: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Auto: Replay: <event title>"
                  />
                </label>
                <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Replay body (optional)</span>
                  <textarea
                    value={form.replayBody}
                    onChange={(e) => setForm({ ...form, replayBody: e.target.value })}
                    rows={2}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Use {{REPLAY_URL}} where the link should go. Leave blank for the default."
                  />
                </label>
                <p className="sm:col-span-2 text-xs text-slate-500">
                  Sent once, only after the recording is uploaded to YouTube (a public,
                  shareable link). If it never reaches YouTube, no replay email goes out. Needs
                  recording turned on above.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : form.id ? "Save changes" : "Schedule event"}
          </button>
          {form.id ? (
            <button
              type="button"
              onClick={() => setForm(emptyForm())}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel edit
            </button>
          ) : null}
          {message ? <span className="text-sm text-slate-600">{message}</span> : null}
        </div>
      </div>

      {/* Event list */}
      <h2 className="mt-8 text-lg font-semibold text-slate-900">Scheduled events</h2>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading...</p>
      ) : events.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No events yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {events.map((e) => (
            <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {e.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.imageUrl}
                  alt=""
                  className="mb-3 w-full max-w-md rounded-lg border border-slate-200"
                />
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{e.title}</h3>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        e.status === "scheduled"
                          ? "bg-emerald-50 text-emerald-700"
                          : e.status === "cancelled"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {e.status}
                    </span>
                    {e.bannerEnabled ? (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        banner: {e.bannerSurfaces.join(", ") || "none"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {new Date(e.startsAt).toLocaleString()} · {e.registrations} registered ·{" "}
                    {e.meetingProvider === "google_meet" ? "Meet" : e.joinUrl ? "manual link" : "no link"} ·
                    recording: {e.recordingStatus}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Invite: {e.inviteCampaignId ? "scheduled" : "none"}
                    {" · "}
                    Replay:{" "}
                    {e.replayEmailedAt
                      ? "sent"
                      : e.replayHoursAfter !== null
                        ? `on (${e.replayHoursAfter}h after)`
                        : "off"}
                  </p>
                  {e.joinUrl ? (
                    <a
                      href={e.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-indigo-600 underline"
                    >
                      {e.joinUrl}
                    </a>
                  ) : null}
                  {e.youtubeStatus && e.youtubeStatus !== "none" ? (
                    <p className="mt-1 text-xs text-slate-500">
                      YouTube: {e.youtubeStatus}
                      {e.youtubeUrl ? (
                        <>
                          {" · "}
                          <a
                            href={e.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 underline"
                          >
                            watch
                          </a>
                        </>
                      ) : null}
                      {e.youtubeStatus === "failed" && e.youtubeError ? (
                        <span className="text-rose-600"> · {e.youtubeError}</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === e.id ? null : e.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                  >
                    {openId === e.id ? "Hide RSVPs" : "RSVPs & recap"}
                  </button>
                  <button
                    type="button"
                    onClick={() => generateImage(e.id)}
                    disabled={imagingId === e.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-60"
                  >
                    {imagingId === e.id ? "Generating..." : e.imageUrl ? "Regenerate image" : "Generate image"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                  >
                    Edit
                  </button>
                  {e.recordingStatus === "ready" || (e.youtubeStatus && e.youtubeStatus !== "none") ? (
                    <button
                      type="button"
                      onClick={() => queueYouTube(e.id)}
                      disabled={youtubingId === e.id || e.youtubeStatus === "uploading"}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#f97316] hover:text-[#c2410c] disabled:opacity-60"
                    >
                      {youtubingId === e.id
                        ? "Queuing..."
                        : e.youtubeStatus === "uploaded"
                          ? "Re-upload to YouTube"
                          : e.youtubeStatus === "failed"
                            ? "Retry YouTube"
                            : "Upload to YouTube"}
                    </button>
                  ) : null}
                  {e.status === "scheduled" && e.recordEnabled && e.recordingStatus === "failed" ? (
                    <button
                      type="button"
                      onClick={() => rearmRecording(e.id)}
                      disabled={rearmingId === e.id}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                    >
                      {rearmingId === e.id ? "Retrying..." : "Retry recording"}
                    </button>
                  ) : null}
                  {e.status === "scheduled" ? (
                    <button
                      type="button"
                      onClick={() => cancelEvent(e.id)}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              {openId === e.id ? <RegistrationsPanel eventId={e.id} /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type RegRow = { email: string; name: string | null; registeredAt: string; cancelled: boolean };
type RecapEvent = {
  recordingStatus: string;
  recordingUrl: string | null;
  aiNotes: { summary: string; keyTopics: string[]; actionItems: string[]; followUps: string[] } | null;
  highlightsEmailedAt: string | null;
};

function RegistrationsPanel({ eventId }: { eventId: string }) {
  const [regs, setRegs] = useState<RegRow[]>([]);
  const [event, setEvent] = useState<RecapEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/events/registrations?id=${encodeURIComponent(eventId)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { registrations?: RegRow[]; event?: RecapEvent };
        if (!alive) return;
        setRegs(data.registrations ?? []);
        setEvent(data.event ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  if (loading) return <p className="mt-3 text-sm text-slate-500">Loading RSVPs...</p>;

  const active = regs.filter((r) => !r.cancelled);
  const notes = event?.aiNotes;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {notes ? (
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">
            AI recap {event?.highlightsEmailedAt ? "(emailed to registrants)" : "(not emailed yet)"}
          </p>
          {notes.summary ? <p className="mt-1 text-slate-700">{notes.summary}</p> : null}
          {notes.actionItems.length ? (
            <div className="mt-2">
              <p className="font-medium text-slate-700">Action items</p>
              <ul className="ml-4 list-disc text-slate-600">
                {notes.actionItems.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {event?.recordingUrl ? (
            <a href={event.recordingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-indigo-600 underline">
              Recording
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm font-medium text-slate-700">{active.length} registered</p>
      {active.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No one has registered yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
          {active.map((r) => (
            <li key={r.email}>
              {r.name ? `${r.name} ` : ""}
              &lt;{r.email}&gt;
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
