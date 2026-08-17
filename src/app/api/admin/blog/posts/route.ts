/**
 * GET  /api/admin/blog/posts  - list every post (manifest + status + locales).
 * POST /api/admin/blog/posts  - create a post: one atomic commit adding the
 *   manifest entry and <id>.en-US.mdx. Vercel deploys the commit (~2-3 min).
 *
 * Permission: blog.manage. Env: GITHUB_CONTENT_TOKEN/REPO (see .env.example).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { buildMdxFile } from "@/lib/blog-markdown";
import type { BlogManifestEntry } from "@/lib/blog";
import { commitFiles, getHead, githubContentConfigured } from "@/lib/github-content";
import {
  CONTENT_DIR,
  MANIFEST_PATH,
  computeStatus,
  loadManifestFromGitHub,
  localesByPost,
  serializeManifest,
  todayISO,
  validateBody,
  validateEntry,
} from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envError() {
  return NextResponse.json(
    { error: "GITHUB_CONTENT_TOKEN / GITHUB_CONTENT_REPO not configured" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!githubContentConfigured()) return envError();

  try {
    const [manifest, locales, head] = await Promise.all([
      loadManifestFromGitHub(),
      localesByPost(),
      getHead(),
    ]);
    const posts = manifest.posts
      .map((entry) => ({
        ...entry,
        status: computeStatus(entry.date || ""),
        locales: locales.get(entry.id) || [],
      }))
      .sort((a, b) => {
        const byDate = (b.date || "").localeCompare(a.date || "");
        if (byDate !== 0) return byDate;
        return (a.order || 0) - (b.order || 0);
      });
    return NextResponse.json({ posts, headSha: head.commitSha, today: todayISO() });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to load posts: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!githubContentConfigured()) return envError();

  let payload: { entry?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateEntry(payload.entry);
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
  const bodyResult = validateBody(payload.body);
  if ("error" in bodyResult) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

  try {
    const manifest = await loadManifestFromGitHub();
    if (manifest.posts.some((p) => p.id === validated.entry.id)) {
      return NextResponse.json(
        { error: `A post with id "${validated.entry.id}" already exists` },
        { status: 409 },
      );
    }

    const entry: BlogManifestEntry = {
      ...validated.entry,
      author: "The Influencer Butler Team",
      image: `/assets/blog/${validated.entry.id}.png`,
      order: manifest.posts.reduce((max, p) => Math.max(max, p.order || 0), 0) + 1,
    };
    manifest.posts.push(entry);

    const mdx = buildMdxFile(
      {
        title: entry.title,
        summary: entry.summary,
        category: entry.category,
        date: entry.date,
        author: entry.author,
        readingTime: entry.readingTime,
        keywords: entry.keywords,
        image: entry.image,
        imageAlt: entry.imageAlt,
      },
      bodyResult.body,
    );

    const { commitSha } = await commitFiles({
      message: `blog(admin): create ${entry.id}\n\nBy ${actor.email} via admin dashboard`,
      changes: [
        { path: MANIFEST_PATH, contentText: serializeManifest(manifest) },
        { path: `${CONTENT_DIR}/${entry.id}.en-US.mdx`, contentText: mdx },
      ],
    });

    await logAdminAction({
      actor,
      action: "blog.create",
      targetType: "blog_post",
      targetId: entry.id,
      details: { date: entry.date, commitSha },
    });

    return NextResponse.json({ entry, commitSha }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Create failed: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}
