/**
 * GET  /api/admin/bundle  - the Grow Together Creator Bundle contributor roster.
 * POST /api/admin/bundle  - update one contributor (status / promo / notes / chapter link).
 *
 * Powers the admin bundle tracker. Gated on marketing.send (this is a list /
 * marketing coordination surface). Reads/writes via the service-role client
 * because bundle_contributors is RLS-locked with no public policy.
 *
 * Degrades gracefully: when the table is not applied yet, GET returns an empty
 * roster with migrationPending:true so the page shows a banner instead of erroring.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLE_SLUG } from "@/app/grow-together/_data/bundleMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["applied", "confirmed", "submitted", "scheduled", "done", "declined"] as const;
type Status = (typeof STATUSES)[number];

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

type ContributorRow = {
  id: string;
  name: string | null;
  email: string | null;
  instagram_handle: string | null;
  other_socials: Record<string, string> | null;
  website: string | null;
  topic: string | null;
  chapter_title: string | null;
  bio: string | null;
  headshot_url: string | null;
  audience_size: string | null;
  status: string | null;
  chapter_url: string | null;
  promo_committed: boolean | null;
  submitted_at: string | null;
  notes: string | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const { data, error } = await db
      .from("bundle_contributors")
      .select(
        "id, name, email, instagram_handle, other_socials, website, topic, chapter_title, bio, headshot_url, audience_size, status, chapter_url, promo_committed, submitted_at, notes, created_at",
      )
      .eq("bundle_slug", BUNDLE_SLUG)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ rows: [], migrationPending: true });
      }
      console.error("admin bundle: read failed", error);
      return NextResponse.json({ error: "Could not load contributors." }, { status: 500 });
    }
    return NextResponse.json({ rows: (data as ContributorRow[]) ?? [], migrationPending: false });
  } catch (err) {
    console.error("admin bundle: read threw", err);
    return NextResponse.json({ error: "Could not load contributors." }, { status: 500 });
  }
}

type UpdateBody = {
  id?: unknown;
  status?: unknown;
  promoCommitted?: unknown;
  chapterUrl?: unknown;
  notes?: unknown;
};

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing contributor id." }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status as Status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = body.status;
    // Stamp submitted_at the first time a chapter is marked submitted.
    if (body.status === "submitted") update.submitted_at = new Date().toISOString();
  }
  if (typeof body.promoCommitted === "boolean") update.promo_committed = body.promoCommitted;
  if (typeof body.chapterUrl === "string") update.chapter_url = body.chapterUrl.trim().slice(0, 400) || null;
  if (typeof body.notes === "string") update.notes = body.notes.trim().slice(0, 2000) || null;

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const { error } = await db.from("bundle_contributors").update(update).eq("id", id);
    if (error) {
      console.error("admin bundle: update failed", error);
      return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin bundle: update threw", err);
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}
