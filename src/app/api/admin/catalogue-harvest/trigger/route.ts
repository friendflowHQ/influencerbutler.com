/**
 * POST /api/admin/catalogue-harvest/trigger
 *
 * Admin-only. Fires a GitHub repository_dispatch event against the
 * InfluencerButler desktop repo to kick the harvest-catalogue.yml workflow
 * out of band (in addition to its 6-hourly cron). The workflow harvests
 * CC + SPCC NDJSON, uploads to R2, then heartbeats this site at
 * /api/admin/catalogue-harvest/heartbeat.
 *
 * Body: { kind?: "cc" | "spcc" | "both" } (defaults to "both")
 *
 * Response:
 *   200 { ok: true, dispatchedAt: ISO }                     on success
 *   403 { error: "Forbidden" }                              non-admin caller
 *   500 { error: ... }                                      misconfigured / GH API failure
 *
 * Required env:
 *   GITHUB_DISPATCH_TOKEN: a fine-grained PAT with Actions: write on the
 *     InfluencerButler desktop repo.
 *   GITHUB_DISPATCH_REPO: "owner/repo" of the InfluencerButler desktop repo
 *     (e.g. "FriendFlow/InfluencerButler").
 *   ADMIN_EMAILS: existing comma-separated admin allowlist.
 */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TriggerBody = { kind?: "cc" | "spcc" | "both" };

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO;
  if (!token || !repo) {
    return NextResponse.json(
      { error: "GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO not configured" },
      { status: 500 },
    );
  }

  let body: TriggerBody = {};
  try {
    body = (await request.json()) as TriggerBody;
  } catch {
    // Empty body is fine; defaults below handle it.
  }
  const kind = body.kind === "cc" || body.kind === "spcc" ? body.kind : "both";

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "harvest-catalogue",
        client_payload: { kind, triggeredBy: admin.email, at: new Date().toISOString() },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `GitHub dispatch failed: ${resp.status} ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      dispatchedAt: new Date().toISOString(),
      kind,
      admin: admin.email,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `GitHub dispatch threw: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}
