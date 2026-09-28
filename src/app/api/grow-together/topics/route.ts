/**
 * GET /api/grow-together/topics
 *
 * Public topic-availability for the Grow Together Creator Bundle recruitment
 * page: how many contributors have claimed each topic, so the landing page and
 * application form can show what still has room and stop someone claiming a full
 * topic. Returns SLUGS AND COUNTS ONLY, never contributor emails or names, so the
 * roster is not exposed on a public route.
 *
 * Degrades gracefully: if the bundle_contributors table is not applied yet, every
 * topic reads as empty (all open) rather than erroring at the visitor.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLE_SLUG, BUNDLE_TOPICS, MAX_CONTRIBUTORS } from "@/app/grow-together/_data/bundleMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Postgres "relation does not exist" (table not migrated yet). */
function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

export async function GET() {
  // taken[slug] = number of contributors who have claimed that topic.
  const taken: Record<string, number> = {};
  // Total non-declined contributors, for the overall roster cap.
  let rosterCount = 0;

  let db: SupabaseClient | null = null;
  try {
    db = createAdminClient();
  } catch {
    db = null; // misconfigured: treat everything as open
  }

  if (db) {
    try {
      const { data, error } = await db
        .from("bundle_contributors")
        .select("topic, status")
        .eq("bundle_slug", BUNDLE_SLUG);
      if (error) {
        if (!isMissingTable(error)) console.error("grow-together topics: read failed", error);
      } else {
        for (const row of data ?? []) {
          // A withdrawn/declined application frees its slot back up.
          if (row.status === "declined") continue;
          rosterCount += 1;
          if (typeof row.topic !== "string") continue;
          taken[row.topic] = (taken[row.topic] ?? 0) + 1;
        }
      }
    } catch (err) {
      console.error("grow-together topics: threw", err);
    }
  }

  const topics = BUNDLE_TOPICS.map((t) => {
    const claimed = taken[t.slug] ?? 0;
    return {
      slug: t.slug,
      title: t.title,
      blurb: t.blurb,
      capacity: t.capacity,
      claimed,
      open: claimed < t.capacity,
    };
  });

  const slotsRemaining = Math.max(0, MAX_CONTRIBUTORS - rosterCount);
  return NextResponse.json({ topics, total: MAX_CONTRIBUTORS, slotsRemaining });
}
