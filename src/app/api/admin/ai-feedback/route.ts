/**
 * GET /api/admin/ai-feedback?days=30
 * Quality signals for Butler AI: thumbs up/down counts (overall and per surface),
 * the most recent thumbs-down answers with the user's reason, and the most common
 * searches that found no (or only a weak) help guide, i.e. the topics that need a
 * new tutorial or video. Super-admin only. If a table has not been applied yet
 * (migrations are hand-applied) that part comes back empty with a flag.
 *
 * Dependencies: @/lib/admin, @/lib/scheduling-server.
 */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROW_CAP = 5000;

type FeedbackRow = {
  rating: "up" | "down";
  surface: string | null;
  reason: string | null;
  question: string | null;
  answer: string | null;
  page: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const days = Math.min(180, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let feedbackMissing = false;
  const bySurface: Record<string, { up: number; down: number }> = {};
  let up = 0;
  let down = 0;
  let recentDown: FeedbackRow[] = [];
  {
    const { data, error } = await admin
      .from("ai_concierge_feedback")
      .select("rating,surface,reason,question,answer,page,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP);
    if (error) {
      feedbackMissing = true;
      console.error("[admin/ai-feedback] feedback", error.message);
    } else {
      const rows = (data ?? []) as FeedbackRow[];
      for (const r of rows) {
        const s = (bySurface[r.surface || "unknown"] ??= { up: 0, down: 0 });
        if (r.rating === "up") { up += 1; s.up += 1; } else { down += 1; s.down += 1; }
      }
      recentDown = rows.filter((r) => r.rating === "down").slice(0, 25);
    }
  }

  let missesMissing = false;
  let topMisses: Array<{ query: string; count: number; confidence: string; lastSeen: string }> = [];
  {
    const { data, error } = await admin
      .from("ai_concierge_search_misses")
      .select("query,confidence,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP);
    if (error) {
      missesMissing = true;
      console.error("[admin/ai-feedback] misses", error.message);
    } else {
      const groups = new Map<string, { query: string; count: number; confidence: string; lastSeen: string }>();
      for (const r of (data ?? []) as Array<{ query: string; confidence: string; created_at: string }>) {
        const key = r.query.trim().toLowerCase();
        const g = groups.get(key);
        if (g) g.count += 1;
        else groups.set(key, { query: r.query.trim(), count: 1, confidence: r.confidence, lastSeen: r.created_at });
      }
      topMisses = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20);
    }
  }

  return NextResponse.json({
    days,
    feedback: { up, down, bySurface, recentDown, missing: feedbackMissing },
    misses: { top: topMisses, missing: missesMissing },
  });
}
