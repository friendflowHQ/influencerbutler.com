"use client";

// Admin blog manager: every post (published, scheduled, parked) with search,
// category filter, a drip-schedule overview, and row actions (duplicate,
// park/unpark, delete). Content lives as files in the repo; every change here
// is a git commit that triggers a Vercel deploy (~2-3 min to live).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ScheduleStrip from "./ScheduleStrip";
import {
  BLOG_CATEGORIES,
  DUPLICATE_KEY,
  PARK_DATE,
  STATUS_BADGE,
  STATUS_LABEL,
  setDeployNotice,
  takeDeployNotice,
  type AdminBlogPost,
  type BlogPostStatus,
} from "./types";

type Tab = "published" | "scheduled" | "parked" | "all";

export default function AdminBlogPage() {
  const [forbidden, setForbidden] = useState(false);
  const [posts, setPosts] = useState<AdminBlogPost[] | null>(null);
  const [today, setToday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [envMissing, setEnvMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deployNotice, setDeployNotice_] = useState<{ commitSha: string; verb: string } | null>(
    null,
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blog/posts", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        if (String(json.error || "").includes("not configured")) setEnvMissing(true);
        setError(json.error || `Failed to load posts (${res.status})`);
        return;
      }
      setError(null);
      setPosts(json.posts as AdminBlogPost[]);
      setToday(json.today as string);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    setDeployNotice_(takeDeployNotice());
    void refetch();
  }, [refetch]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { published: 0, scheduled: 0, parked: 0, all: 0 };
    for (const post of posts || []) {
      c[post.status] += 1;
      c.all += 1;
    }
    return c;
  }, [posts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts || []).filter((post) => {
      if (tab !== "all" && post.status !== tab) return false;
      if (category && post.category !== category) return false;
      if (
        q &&
        !post.title.toLowerCase().includes(q) &&
        !post.id.toLowerCase().includes(q) &&
        !(post.keywords || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [posts, tab, query, category]);

  // Park/unpark: fetch the full post, PUT it back with only the date changed.
  const setDate = useCallback(
    async (post: AdminBlogPost, date: string, verb: string) => {
      setBusyId(post.id);
      try {
        const res = await fetch(`/api/admin/blog/posts/${post.id}?locale=en-US`, {
          cache: "no-store",
        });
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load post");
        const put = await fetch(`/api/admin/blog/posts/${post.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry: { ...json.entry, date },
            body: json.body,
            locale: "en-US",
            expectedHeadSha: json.headSha,
          }),
        });
        const putJson = await put.json();
        if (!put.ok) throw new Error(putJson.error || `${verb} failed`);
        setDeployNotice(putJson.commitSha as string, verb);
        setDeployNotice_({ commitSha: putJson.commitSha as string, verb });
        await refetch();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [refetch],
  );

  const duplicate = useCallback(async (post: AdminBlogPost) => {
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/admin/blog/posts/${post.id}?locale=en-US`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load post");
      sessionStorage.setItem(
        DUPLICATE_KEY,
        JSON.stringify({
          fields: {
            title: `${json.entry.title} (copy)`,
            category: json.entry.category,
            summary: json.entry.summary,
            readingTime: json.entry.readingTime,
            keywords: json.entry.keywords,
            imageAlt: json.entry.imageAlt,
            imagePrompt: json.entry.imagePrompt || "",
            pinDescription: json.entry.pinDescription || "",
          },
          body: json.body,
        }),
      );
      window.location.href = "/dashboard/admin/blog/new";
    } catch (err) {
      setError((err as Error).message);
      setBusyId(null);
    }
  }, []);

  const remove = useCallback(
    async (post: AdminBlogPost) => {
      const typed = prompt(
        `This permanently deletes the post, its translations, and its hero image from the repo.\n\nType the slug to confirm: ${post.id}`,
      );
      if (typed !== post.id) return;
      setBusyId(post.id);
      try {
        const res = await fetch(`/api/admin/blog/posts/${post.id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Delete failed");
        setDeployNotice_({ commitSha: json.commitSha as string, verb: "Post deleted" });
        await refetch();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [refetch],
  );

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "published", label: "Published" },
    { key: "scheduled", label: "Scheduled" },
    { key: "parked", label: "Parked" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Blog</h1>
          <p className="mt-1 text-sm text-slate-600">
            Write, schedule, and edit posts. Saves commit to the repo and deploy in ~2-3 minutes;
            scheduled posts go live on their date automatically.
          </p>
        </div>
        <Link
          href="/dashboard/admin/blog/new"
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#ea580c]"
        >
          New post
        </Link>
      </div>

      {deployNotice ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {deployNotice.verb}: committed{" "}
          <code className="rounded bg-emerald-100 px-1">{deployNotice.commitSha.slice(0, 7)}</code>{" "}
          - deploying now, live in ~2-3 minutes.
        </div>
      ) : null}

      {envMissing ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The blog manager needs GitHub access to read and commit content. Set
          <code className="mx-1 rounded bg-amber-100 px-1">GITHUB_CONTENT_TOKEN</code> (fine-grained
          PAT with Contents read &amp; write on this site&apos;s repo) and
          <code className="mx-1 rounded bg-amber-100 px-1">GITHUB_CONTENT_REPO</code> in Vercel.
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {posts && today ? (
        <div className="mt-6">
          <ScheduleStrip posts={posts} today={today} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-[#f97316] text-[#f97316]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {counts[t.key]}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, slug, keywords..."
            className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-[#f97316] focus:outline-none"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-[#f97316] focus:outline-none"
          >
            <option value="">All categories</option>
            {BLOG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!posts ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">No posts match.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.image}
                alt=""
                className="h-12 w-[72px] shrink-0 rounded-md border border-slate-100 bg-slate-100 object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/admin/blog/edit/${post.id}`}
                  className="block truncate text-sm font-medium text-slate-900 hover:text-[#f97316]"
                >
                  {post.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="truncate">{post.id}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{post.category}</span>
                  <span>{post.date}</span>
                  <span>{post.readingTime}</span>
                  {post.locales.length > 1
                    ? post.locales
                        .filter((l) => l !== "en-US")
                        .map((l) => (
                          <span key={l} className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">
                            {l.slice(0, 2)}
                          </span>
                        ))
                    : null}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[post.status as BlogPostStatus]}`}
              >
                {STATUS_LABEL[post.status as BlogPostStatus]}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {post.status === "published" ? (
                  <a
                    href={`/blog/${post.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  >
                    View
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => duplicate(post)}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                >
                  Duplicate
                </button>
                {post.status === "parked" ? (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => {
                      if (confirm(`Publish "${post.title}" today?`)) {
                        void setDate(post, today, "Post unparked");
                      }
                    }}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                  >
                    Unpark
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => {
                      if (
                        confirm(
                          `Park "${post.title}"? It will be hidden from the blog (date set to ${PARK_DATE}).`,
                        )
                      ) {
                        void setDate(post, PARK_DATE, "Post parked");
                      }
                    }}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                  >
                    Park
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => remove(post)}
                  className="rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
