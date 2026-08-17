/**
 * POST /api/admin/blog/autopilot/screenshots - request fresh app/extension
 * screenshots via repository_dispatch to the desktop repo (which hosts both
 * the Electron app and the Chrome extension source). The desktop workflow
 * captures the requested shots and commits PNGs + caption updates to THIS
 * repo under public/assets/app/, where the autopilot writer picks them up
 * automatically (screenshot-index.ts dynamicScreenshots).
 *
 * Contract + desktop workflow reference: docs/autopilot-capture-spec.md.
 * Body: { shots?: [{id, target, caption}] } - omitted = the default set.
 * Env: GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO (existing, desktop repo).
 * Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShotRequest = { id: string; target: string; caption: string };

const DEFAULT_SHOTS: ShotRequest[] = [
  { id: "app-dashboard", target: "app.dashboard", caption: "The Influencer Butler desktop dashboard with the butler workspaces sidebar" },
  { id: "app-daily-deals", target: "app.daily-deals", caption: "Deals Influencer Butler workspace with the deal feed and posting schedule" },
  { id: "app-orders-butler", target: "app.orders-butler", caption: "Orders Butler workspace with synced Amazon order history" },
  { id: "app-pitch-butler", target: "app.pitch-butler", caption: "Pitch Butler CRM board with brand pipelines" },
  { id: "app-action-queue", target: "app.action-queue", caption: "Action Queue inbox with butler decisions waiting for review" },
  { id: "ext-popup", target: "extension.popup", caption: "Chrome extension popup with quick stats and controls" },
  { id: "ext-options", target: "extension.options", caption: "Chrome extension options page" },
];

const SHOT_ID_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO;
  if (!token || !repo) {
    return NextResponse.json(
      { error: "GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO not configured" },
      { status: 500 },
    );
  }

  let body: { shots?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body = default shot list.
  }
  const shots: ShotRequest[] = Array.isArray(body.shots)
    ? body.shots
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          id: String(s.id ?? ""),
          target: String(s.target ?? "").slice(0, 100),
          caption: String(s.caption ?? "").slice(0, 300),
        }))
        .filter((s) => SHOT_ID_RE.test(s.id) && s.target)
        .slice(0, 20)
    : DEFAULT_SHOTS;
  if (!shots.length) {
    return NextResponse.json({ error: "No valid shots requested" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
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
        event_type: "capture-screenshots",
        client_payload: {
          requestId,
          requestedBy: actor.email,
          shots: shots.map((s) => ({
            ...s,
            outPath: `public/assets/app/${s.id}.png`,
          })),
        },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `GitHub dispatch failed: ${resp.status} ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    await logAdminAction({
      actor,
      action: "blog.autopilot.screenshots.request",
      targetType: "blog_autopilot",
      targetId: requestId,
      details: { shots: shots.length },
    });

    return NextResponse.json({
      ok: true,
      requestId,
      shots: shots.length,
      note: "Captured screenshots land in public/assets/app/ via a commit from the desktop repo workflow (see docs/autopilot-capture-spec.md). New shots join the writer's screenshot index automatically.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Dispatch threw: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
