/**
 * POST /api/admin/extension-feedback/update
 * Body: { id: string, action: "resolve" | "reviewed" | "reopen",
 *         resolvedVersion?: string, note?: string }
 *
 * Triages one extension_feedback row. Gated on support.respond.
 *
 * - resolve: mark it fixed and stamp the version that shipped the fix plus an
 *   optional customer-facing note. This is what surfaces the row in that user's
 *   post-update "What's New" notice ("issues you reported that we fixed"),
 *   served by GET /api/extension/feedback/resolved.
 * - reviewed: mark it triaged without resolving.
 * - reopen: send it back to the new queue and clear any resolution.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumnError, isMissingTableError } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateBody = { id?: unknown; action?: unknown; resolvedVersion?: unknown; note?: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const NOTE_MAX = 300;

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const action = body.action;
  let patch: Record<string, unknown>;
  const audit: Record<string, unknown> = { action };

  if (action === "resolve") {
    const resolvedVersion =
      typeof body.resolvedVersion === "string" ? body.resolvedVersion.trim() : "";
    if (!VERSION_RE.test(resolvedVersion)) {
      return NextResponse.json({ error: "Bad resolvedVersion" }, { status: 400 });
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, NOTE_MAX)
        : null;
    patch = {
      status: "resolved",
      resolved_version: resolvedVersion,
      resolved_at: new Date().toISOString(),
      resolution_note: note,
    };
    audit.resolvedVersion = resolvedVersion;
    audit.hasNote = note !== null;
  } else if (action === "reviewed") {
    patch = { status: "reviewed" };
  } else if (action === "reopen") {
    patch = { status: "new", resolved_version: null, resolved_at: null, resolution_note: null };
  } else {
    return NextResponse.json({ error: "Bad action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_feedback")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    // The resolution columns are not applied yet (or the whole table): tell the
    // operator to run the migration instead of a generic 500.
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return NextResponse.json(
        { error: "Run the extension_feedback resolution migration first.", migrationPending: true },
        { status: 409 },
      );
    }
    console.error("admin/extension-feedback/update: update failed", error);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAdminAction({
    actor,
    action: "support.respond",
    targetType: "extension_feedback",
    targetId: id,
    details: audit,
  });

  return NextResponse.json({ ok: true });
}
