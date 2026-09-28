/**
 * POST /api/admin/emails/audience-preview
 *
 * Resolves an Audience payload to a live recipient count and a small sample,
 * using the exact same resolver as the cron's materializer so the "will send
 * to N people" preview can never drift from what actually sends.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAudience, resolveAudience } from "@/lib/email-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_SIZE = 10;

export async function POST(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let body: { audience?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const audience = parseAudience(body.audience);
  if (!audience) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }

  const { emails, migrationPending } = await resolveAudience(db, audience);

  return NextResponse.json({
    count: emails.length,
    sample: emails.slice(0, SAMPLE_SIZE),
    migrationPending,
  });
}
