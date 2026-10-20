/**
 * GET /api/admin/ai-sessions-export  (CRON_SECRET-guarded, machine-to-machine)
 * Reads ai_concierge_sessions over a date window for the weekly tutorial-gap
 * miner (the scheduled task that turns recurring customer questions into draft
 * tutorials). Uses the same CRON_SECRET as the ops-health / cron routes and
 * fails closed when it is unset.
 *
 * Privacy by design: this route returns ONLY the AI-derived `summary` JSONB
 * ({ summary, keyTopics, actionItems, followUps }) for each session. It NEVER
 * returns the raw transcript, user_email, or user_id. The miner needs the
 * distilled topics and open questions to spot recurring gaps, not who asked or
 * their verbatim words, so no raw customer message or identity leaves the
 * database here.
 *
 * Params: since (ISO, default now-7d), until (ISO, default now),
 *   limit (default 200, max 500), mode ("text" | "voice").
 *
 * Dependencies: @/lib/scheduling-server (getAdmin), @/lib/auth-secret (verifyBearer).
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { verifyBearer } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function isoOrNull(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const now = Date.now();
  const since = isoOrNull(url.searchParams.get("since")) ?? new Date(now - 7 * DAY_MS).toISOString();
  const until = isoOrNull(url.searchParams.get("until")) ?? new Date(now).toISOString();
  const modeParam = url.searchParams.get("mode");
  const mode = modeParam === "text" || modeParam === "voice" ? modeParam : null;

  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Summary only: never select `transcript`, `user_email`, or `user_id`.
  let query = admin
    .from("ai_concierge_sessions")
    .select("id,mode,started_at,ended_at,summary")
    .gte("started_at", since)
    .lt("started_at", until)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (mode) query = query.eq("mode", mode);

  const { data, error } = await query;
  if (error) {
    console.error("[ai-sessions-export]", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json({
    ok: true,
    since,
    until,
    mode: mode || "all",
    count: rows.length,
    sessions: rows,
  });
}
