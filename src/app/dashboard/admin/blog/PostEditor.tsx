"use client";

// Shared create/edit form for blog posts. Left column: manifest metadata.
// Right column: markdown body with a live preview that runs the SAME
// renderMarkdown the public /blog/[slug] page uses, inside the same
// help-tutorial-body prose wrapper, so what you see is what ships.
// Saves go to the admin blog API, which commits to the repo (one atomic
// commit per save) and triggers a Vercel deploy.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { renderMarkdown } from "@/lib/blog-markdown";
import HeroImagePanel from "./HeroImagePanel";
import {
  BLOG_CATEGORIES,
  DUPLICATE_KEY,
  PARK_DATE,
  computeStatusClient,
  setDeployNotice,
  type AdminBlogPost,
  type BlogLocale,
  type BlogManifestEntry,
} from "./types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

type Fields = {
  id: string;
  title: string;
  category: string;
  summary: string;
  date: string;
  readingTime: string;
  keywords: string;
  imageAlt: string;
  imagePrompt: string;
  pinImage: string;
  pinDescription: string;
};

const EMPTY_FIELDS: Fields = {
  id: "",
  title: "",
  category: "Growth",
  summary: "",
  date: "",
  readingTime: "",
  keywords: "",
  imageAlt: "",
  imagePrompt: "",
  pinImage: "",
  pinDescription: "",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 81);
}

function autoReadingTime(body: string): string {
  const words = body.split(/\s+/).filter(Boolean).length;
  return `${Math.max(3, Math.round(words / 225))} min read`;
}

type Lint = { message: string; fix?: () => void };

export default function PostEditor({ mode, slug }: { mode: "create" | "edit"; slug?: string }) {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fields, setFields] = useState<Fields>({ ...EMPTY_FIELDS, date: todayISO() });
  const [body, setBody] = useState("");
  const [locale, setLocale] = useState<BlogLocale>("en-US");
  const [locales, setLocales] = useState<BlogLocale[]>(["en-US"]);
  const [headSha, setHeadSha] = useState<string | undefined>(undefined);
  const [entry, setEntry] = useState<BlogManifestEntry | null>(null);

  // Existing posts, for duplicate-id checks and the "next open slot" pick.
  const [allPosts, setAllPosts] = useState<AdminBlogPost[]>([]);

  const [readingTimeTouched, setReadingTimeTouched] = useState(false);
  const [idTouched, setIdTouched] = useState(mode === "edit");
  const [view, setView] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const handle403 = useCallback((res: Response) => {
    if (res.status === 403) {
      setForbidden(true);
      return true;
    }
    return false;
  }, []);

  // Load the post list (both modes) for slot-picking + duplicate checks.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/blog/posts", { cache: "no-store" });
        if (handle403(res)) return;
        const json = await res.json();
        if (res.ok) setAllPosts(json.posts as AdminBlogPost[]);
      } catch {
        // Non-fatal: quick-picks degrade gracefully.
      }
    })();
  }, [handle403]);

  // Load the post being edited, or a duplicate template for create mode.
  useEffect(() => {
    if (mode === "create") {
      try {
        const raw = sessionStorage.getItem(DUPLICATE_KEY);
        if (raw) {
          sessionStorage.removeItem(DUPLICATE_KEY);
          const dup = JSON.parse(raw) as { fields: Partial<Fields>; body: string };
          setFields((prev) => ({ ...prev, ...dup.fields, id: "", date: todayISO() }));
          setBody(dup.body || "");
          setReadingTimeTouched(Boolean(dup.fields.readingTime));
        }
      } catch {
        // Corrupt duplicate payload: start blank.
      }
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/admin/blog/posts/${slug}?locale=${locale}`, {
          cache: "no-store",
        });
        if (handle403(res)) return;
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error || `Failed to load post (${res.status})`);
          return;
        }
        const e = json.entry as BlogManifestEntry;
        setEntry(e);
        setLocales((json.locales as BlogLocale[])?.length ? json.locales : ["en-US"]);
        setHeadSha(json.headSha as string);
        setBody(json.body as string);
        if (locale === "en-US") {
          setFields({
            id: e.id,
            title: e.title || "",
            category: e.category || "Growth",
            summary: e.summary || "",
            date: e.date || todayISO(),
            readingTime: e.readingTime || "",
            keywords: e.keywords || "",
            imageAlt: e.imageAlt || "",
            imagePrompt: e.imagePrompt || "",
            pinImage: e.pinImage || "",
            pinDescription: e.pinDescription || "",
          });
        } else {
          // Translation files carry translated frontmatter; the manifest stays
          // English. Populate the translated text fields from frontmatter.
          const fm = (json.frontmatter || {}) as Record<string, string>;
          setFields({
            id: e.id,
            title: fm.title || e.title || "",
            category: e.category || "Growth",
            summary: fm.summary || e.summary || "",
            date: e.date || todayISO(),
            readingTime: fm.readingTime || e.readingTime || "",
            keywords: fm.keywords || e.keywords || "",
            imageAlt: fm.imageAlt || e.imageAlt || "",
            imagePrompt: e.imagePrompt || "",
            pinImage: e.pinImage || "",
            pinDescription: e.pinDescription || "",
          });
        }
        setReadingTimeTouched(true);
        dirtyRef.current = false;
      } catch (err) {
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, slug, locale, handle403]);

  const setField = (key: keyof Fields, value: string) => {
    dirtyRef.current = true;
    setSavedNotice(null);
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (mode === "create" && key === "title" && !idTouched) {
        next.id = slugFromTitle(value);
      }
      return next;
    });
  };

  const onBodyChange = (value: string) => {
    dirtyRef.current = true;
    setSavedNotice(null);
    setBody(value);
    if (!readingTimeTouched) {
      setFields((prev) => ({ ...prev, readingTime: autoReadingTime(value) }));
    }
  };

  // ---- Validation + lint -------------------------------------------------

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!SLUG_RE.test(fields.id)) list.push("Slug must be lowercase letters, digits, and hyphens.");
    if (mode === "create" && allPosts.some((p) => p.id === fields.id)) {
      list.push(`A post with slug "${fields.id}" already exists.`);
    }
    if (!fields.title.trim()) list.push("Title is required.");
    if (!fields.summary.trim()) list.push("Summary is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) list.push("Date must be yyyy-mm-dd.");
    if (!/^\d+ min read$/.test(fields.readingTime.trim())) {
      list.push('Reading time must look like "7 min read".');
    }
    if (!fields.keywords.trim()) list.push("Keywords are required.");
    if (!fields.imageAlt.trim()) list.push("Image alt text is required.");
    if (!body.trim()) list.push("Body is required.");
    return list;
  }, [fields, body, mode, allPosts]);

  const lints = useMemo(() => {
    const list: Lint[] = [];
    const everything = Object.values(fields).join("\n") + "\n" + body;
    if (everything.includes("\u2014")) {
      list.push({
        message: "Em dash found - this repo bans them (use ':' or '-').",
        fix: () => {
          setFields((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next) as (keyof Fields)[]) {
              next[key] = next[key].replace(/\u2014/g, "-");
            }
            return next;
          });
          setBody((prev) => prev.replace(/\u2014/g, "-"));
        },
      });
    }
    if (/^\s*\|/m.test(body)) {
      list.push({ message: "Table syntax detected - the blog renderer does not support tables." });
    }
    if (/^\s{2,}([-*]|\d+\.)\s/m.test(body)) {
      list.push({ message: "Indented list detected - nested lists flatten to one level." });
    }
    if (/<[a-zA-Z]/.test(body)) {
      list.push({ message: "Raw HTML detected - it renders as escaped text, not markup." });
    }
    for (const match of body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (!match[1].startsWith("/assets/")) {
        list.push({ message: `Image "${match[1].slice(0, 60)}" is not under /assets/ and will be dropped.` });
      }
    }
    for (const match of body.matchAll(/(^|[^!])\[[^\]]+\]\(([^)]+)\)/gm)) {
      const href = match[2];
      if (!/^https?:\/\//i.test(href) && !/^\/[A-Za-z0-9]/.test(href)) {
        list.push({ message: `Link "${href.slice(0, 60)}" must be http(s) or root-relative; it will render as "#".` });
      }
    }
    return list;
  }, [fields, body]);

  const previewHtml = useMemo(
    () => (view === "preview" ? renderMarkdown(body) : ""),
    [view, body],
  );

  // ---- Date quick-picks --------------------------------------------------

  const nextOpenSlot = useMemo(() => {
    const scheduled = allPosts
      .filter((p) => p.status === "scheduled")
      .map((p) => p.date)
      .sort();
    const latest = scheduled[scheduled.length - 1];
    const base = latest && latest > todayISO() ? latest : todayISO();
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [allPosts]);

  // ---- Save --------------------------------------------------------------

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    setSaveError(null);
    setConflict(false);
    const payloadEntry = {
      id: fields.id,
      title: fields.title,
      category: fields.category,
      summary: fields.summary,
      date: fields.date,
      readingTime: fields.readingTime.trim(),
      keywords: fields.keywords,
      imageAlt: fields.imageAlt,
      imagePrompt: fields.imagePrompt || undefined,
      pinImage: fields.pinImage || undefined,
      pinDescription: fields.pinDescription || undefined,
    };
    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/blog/posts" : `/api/admin/blog/posts/${fields.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "create"
              ? { entry: payloadEntry, body }
              : { entry: payloadEntry, body, locale, expectedHeadSha: headSha },
          ),
        },
      );
      if (handle403(res)) return;
      const json = await res.json();
      if (res.status === 409 && mode === "edit") {
        setConflict(true);
        setSaveError(json.error || "Post changed since you opened it.");
        return;
      }
      if (!res.ok) {
        setSaveError(json.error || `Save failed (${res.status})`);
        return;
      }
      dirtyRef.current = false;
      const sha = (json.commitSha as string) || "";
      setDeployNotice(sha, mode === "create" ? "Post created" : "Post saved");
      if (mode === "create") {
        router.push(`/dashboard/admin/blog/edit/${fields.id}`);
      } else {
        setEntry(json.entry as BlogManifestEntry);
        setSavedNotice(
          `Committed ${sha.slice(0, 7)} - deploying now, live on the site in ~2-3 minutes.`,
        );
        // Refresh the head sha so the next save's conflict check is current.
        try {
          const fresh = await fetch(`/api/admin/blog/posts/${fields.id}?locale=${locale}`, {
            cache: "no-store",
          });
          if (fresh.ok) {
            const freshJson = await fresh.json();
            setHeadSha(freshJson.headSha as string);
          }
        } catch {
          // The stale sha just means the next save re-checks against GitHub.
        }
      }
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ---- Render ------------------------------------------------------------

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 h-96 animate-pulse rounded-xl bg-slate-50" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Could not load post</h1>
        <p className="mt-2 text-sm text-rose-600">{loadError}</p>
      </div>
    );
  }

  const status = computeStatusClient(fields.date, todayISO());
  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#f97316] focus:outline-none";
  const labelClass = "block text-xs font-medium text-slate-600";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === "create" ? "New blog post" : `Edit: ${entry?.title || fields.id}`}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === "create"
              ? "Saving commits the post to the repo; a future date schedules it automatically."
              : "Every save is one commit updating the manifest and the article together."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/admin/blog"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to posts
          </a>
          <button
            type="button"
            onClick={save}
            disabled={saving || errors.length > 0}
            className="rounded-lg bg-[#f97316] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#ea580c] disabled:opacity-50"
          >
            {saving ? "Committing..." : mode === "create" ? "Create post" : "Save changes"}
          </button>
        </div>
      </div>

      {savedNotice ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {savedNotice}
        </div>
      ) : null}
      {conflict ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {saveError} Copy any unsaved edits somewhere safe, then reload this page and re-apply
          them.
        </div>
      ) : saveError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {saveError}
        </div>
      ) : null}

      {mode === "edit" && locales.length > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-slate-600">Language:</span>
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                if (dirtyRef.current && !confirm("Discard unsaved changes and switch language?")) {
                  return;
                }
                setLoading(true);
                setLocale(l);
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                locale === l
                  ? "border-[#f97316] bg-orange-50 text-[#f97316]"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l}
            </button>
          ))}
          <span className="text-xs text-slate-400">
            (dates, category, and images follow the English version)
          </span>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left: metadata */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Details</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  status === "published"
                    ? "bg-emerald-50 text-emerald-700"
                    : status === "scheduled"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {status === "published"
                  ? "Will be live"
                  : status === "scheduled"
                    ? `Scheduled for ${fields.date}`
                    : "Parked (hidden)"}
              </span>
            </div>

            <label className={`${labelClass} mt-3`}>
              Title
              <input
                className={inputClass}
                value={fields.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="How to..."
              />
            </label>

            <label className={`${labelClass} mt-3`}>
              Slug
              <input
                className={`${inputClass} ${mode === "edit" ? "bg-slate-50 text-slate-500" : ""}`}
                value={fields.id}
                readOnly={mode === "edit"}
                onChange={(e) => {
                  setIdTouched(true);
                  setField("id", e.target.value);
                }}
                placeholder="my-post-slug"
              />
            </label>
            {mode === "edit" ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Slugs are permanent (inbound links). Duplicate + delete to rename.
              </p>
            ) : null}

            <label className={`${labelClass} mt-3`}>
              Category
              <select
                className={inputClass}
                value={fields.category}
                onChange={(e) => setField("category", e.target.value)}
              >
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelClass} mt-3`}>
              Publish date
              <input
                type="date"
                className={inputClass}
                value={fields.date}
                onChange={(e) => setField("date", e.target.value)}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setField("date", todayISO())}
                className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setField("date", nextOpenSlot)}
                title="The day after the last scheduled post"
                className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                Next open slot ({nextOpenSlot})
              </button>
              <button
                type="button"
                onClick={() => setField("date", PARK_DATE)}
                title="Hide the post without deleting it"
                className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                Park
              </button>
            </div>

            <label className={`${labelClass} mt-3`}>
              Summary
              <textarea
                className={`${inputClass} min-h-[70px]`}
                value={fields.summary}
                onChange={(e) => setField("summary", e.target.value)}
                placeholder="Shown on the blog index and in search results."
              />
            </label>

            <label className={`${labelClass} mt-3`}>
              Keywords (comma-separated)
              <input
                className={inputClass}
                value={fields.keywords}
                onChange={(e) => setField("keywords", e.target.value)}
                placeholder="amazon influencer tips, ..."
              />
            </label>

            <label className={`${labelClass} mt-3`}>
              Reading time
              <input
                className={inputClass}
                value={fields.readingTime}
                onChange={(e) => {
                  setReadingTimeTouched(true);
                  setField("readingTime", e.target.value);
                }}
                placeholder="7 min read"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Images</h2>
            <label className={`${labelClass} mt-3`}>
              Hero alt text
              <input
                className={inputClass}
                value={fields.imageAlt}
                onChange={(e) => setField("imageAlt", e.target.value)}
                placeholder="Illustration of..."
              />
            </label>
            <label className={`${labelClass} mt-3`}>
              AI image prompt
              <textarea
                className={`${inputClass} min-h-[70px]`}
                value={fields.imagePrompt}
                onChange={(e) => setField("imagePrompt", e.target.value)}
                placeholder="a relaxed creator at a desk, warm mood... (brand style is added automatically)"
              />
            </label>
            <label className={`${labelClass} mt-3`}>
              Pinterest pin image path (optional)
              <input
                className={inputClass}
                value={fields.pinImage}
                onChange={(e) => setField("pinImage", e.target.value)}
                placeholder="/assets/blog/pins/my-post.png"
              />
            </label>
            <label className={`${labelClass} mt-3`}>
              Pinterest description (optional)
              <textarea
                className={`${inputClass} min-h-[60px]`}
                value={fields.pinDescription}
                onChange={(e) => setField("pinDescription", e.target.value)}
              />
            </label>
          </div>

          {mode === "edit" && locale === "en-US" ? (
            <HeroImagePanel
              id={fields.id}
              imagePrompt={fields.imagePrompt}
              imagePath={entry?.image || `/assets/blog/${fields.id}.png`}
            />
          ) : null}
          {mode === "create" ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
              Create the post first, then generate or upload its hero image from the edit screen.
            </div>
          ) : null}

          {errors.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <ul className="list-disc pl-4 text-xs text-rose-700">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lints.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <ul className="space-y-1 text-xs text-amber-800">
                {lints.map((lint, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span>{lint.message}</span>
                    {lint.fix ? (
                      <button
                        type="button"
                        onClick={lint.fix}
                        className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100"
                      >
                        Fix
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Right: body + preview */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Article</h2>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {(["write", "preview"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                    view === v ? "bg-[#f97316] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {view === "write" ? (
            <textarea
              className="mt-3 min-h-[600px] w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-[13px] leading-relaxed text-slate-900 focus:border-[#f97316] focus:outline-none"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={
                "Markdown subset: # headings, paragraphs, - bullets, 1. numbered lists, " +
                "```code fences```, > quotes, **bold**, *italic*, [links](/pricing), " +
                "![alt](/assets/blog/image.png). No tables, no nested lists, no raw HTML."
              }
              spellCheck
            />
          ) : (
            <div
              className="help-tutorial-body mt-3 min-h-[600px] rounded-lg border border-slate-200 p-6"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            {body.split(/\s+/).filter(Boolean).length} words. The preview uses the exact renderer
            the public blog uses.
          </p>
        </div>
      </div>
    </div>
  );
}
