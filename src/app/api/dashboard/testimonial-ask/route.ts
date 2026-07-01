/**
 * GET  /api/dashboard/testimonial-ask  -> { show: boolean }
 * POST /api/dashboard/testimonial-ask  { action: "dismiss" } -> { ok: true }
 *
 * Backs the in-app "leave a testimonial" banner. Shows for a signed-in
 * subscriber who has been active ~45 days (into their second month), has not yet
 * submitted a testimonial, and has not dismissed the banner. Dismissal is
 * persisted server-side (subscriptions.testimonial_banner_dismissed_at) so we
 * don't nag across sessions. subscriptions is RLS-locked, so both read and write
 * go through the service-role client after verifying the session.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGE_DAYS = 45;

type AskAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
  };
};

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ show: false });

  const admin = createAdminClient() as unknown as AskAdmin | null;
  if (!admin) return NextResponse.json({ show: false });

  try {
    const { data } = await admin
      .from("subscriptions")
      .select("status,created_at,testimonial_submitted_at,testimonial_banner_dismissed_at,testimonial_requested_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const row = ((data as Array<Record<string, unknown>> | null) ?? [])[0];
    if (!row) return NextResponse.json({ show: false });

    const active = row.status === "active";
    const oldEnough =
      typeof row.created_at === "string" &&
      Date.now() - new Date(row.created_at).getTime() >= AGE_DAYS * 24 * 60 * 60 * 1000;
    const notDone = !row.testimonial_submitted_at;
    const notDismissed = !row.testimonial_banner_dismissed_at;

    return NextResponse.json({ show: active && oldEnough && notDone && notDismissed });
  } catch (err) {
    console.error("testimonial-ask GET failed", err);
    return NextResponse.json({ show: false });
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let action = "";
  try {
    const body = (await request.json()) as { action?: string };
    action = body.action ?? "";
  } catch {
    // fall through to bad-request below
  }
  if (action !== "dismiss") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const admin = createAdminClient() as unknown as AskAdmin | null;
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  try {
    await admin
      .from("subscriptions")
      .update({ testimonial_banner_dismissed_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (err) {
    console.error("testimonial-ask dismiss failed", err);
  }
  return NextResponse.json({ ok: true });
}
