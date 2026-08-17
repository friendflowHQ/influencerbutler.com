/**
 * Summary: Shared helpers for the autopilot admin routes: env guard, queue
 *   commit wrapper ([vercel skip] so queue-only edits don't trigger deploys),
 *   and slug utilities.
 * Dependencies: lib/github-content, lib/blog-autogen/queue.
 */
import { NextResponse } from "next/server";
import { commitFiles, githubContentConfigured } from "@/lib/github-content";
import { QUEUE_PATH, serializeQueue } from "@/lib/blog-autogen/queue";
import type { AutogenQueue } from "@/lib/blog-autogen/types";

export function envError(): NextResponse | null {
  if (githubContentConfigured()) return null;
  return NextResponse.json(
    { error: "GITHUB_CONTENT_TOKEN / GITHUB_CONTENT_REPO not configured" },
    { status: 500 },
  );
}

export async function commitQueue(
  queue: AutogenQueue,
  verb: string,
  actorEmail: string,
  expectedHeadSha?: string,
): Promise<string> {
  const { commitSha } = await commitFiles({
    message: `blog(autopilot): ${verb} [vercel skip]\n\nBy ${actorEmail} via admin dashboard`,
    changes: [{ path: QUEUE_PATH, contentText: serializeQueue(queue) }],
    expectedHeadSha,
  });
  return commitSha;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 81);
}

/** Make `slug` unique against both the manifest ids and queue slugs. */
export function dedupeSlug(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; n < 100; n++) {
    const candidate = `${slug.slice(0, 78)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${slug.slice(0, 70)}-${Date.now() % 100000}`;
}
