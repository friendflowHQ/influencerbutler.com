/**
 * GET  /api/dashboard/testimonial-ask  -> { show: boolean, canSnooze: boolean }
 * POST /api/dashboard/testimonial-ask  { action: "dismiss" | "snooze" } -> { ok: true }
 *   dismiss = never ask again; snooze = hide for 14 days, then ask once more.
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
import { askAllowed, hasOpenSupportTicket, readAskState, recordAsk } from "@/lib/testimonial-ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGE_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;
const SNOOZE_DAYS = 14;
const EMAIL_COOLDOWN_DAYS = 3;

/** Snooze timestamps carry a 777 ms marker so they can be told apart from permanent dismissals. */
function isSnoozeStamp(d: Date): boolean {
  return d.getUTCMilliseconds() === 777;
}

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

async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ show: false });
  const userId = user.id;

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

    // Cooldown: don't stack the banner on top of an email ask sent in the last few days.
    const emailedAt =
      typeof row.testimonial_requested_at === "string"
        ? new Date(row.testimonial_requested_at).getTime()
        : null;
    const coolingDown = emailedAt !== null && Date.now() - emailedAt < EMAIL_COOLDOWN_DAYS * DAY_MS;

    // Dismissal states (all stored in testimonial_banner_dismissed_at, no new column):
    //   null            -> never dismissed: show, offer "Remind me later"
    //   snooze stamp    -> ms === 777: hidden until that (future) time, then re-shown ONCE
    //                      with no snooze option, so asks are capped at two appearances
    //   anything else   -> permanent "don't ask again" (also every pre-snooze dismissal)
    const dismissedRaw = row.testimonial_banner_dismissed_at;
    let dismissalOk = true;
    let canSnooze = true;
    if (typeof dismissedRaw === "string" && dismissedRaw) {
      const at = new Date(dismissedRaw);
      if (!isSnoozeStamp(at)) {
        dismissalOk = false;
      } else if (at.getTime() > Date.now()) {
        dismissalOk = false;
      } else {
        canSnooze = false;
      }
    }

    let show = active && oldEnough && notDone && dismissalOk && !coolingDown;
    if (show) {
      // Lifetime cap + 14-day cooldown (needs the ask-state migration; tolerant
      // of it being missing), then hold off while a support ticket is open.
      const state = await readAskState(admin, userId);
      show = askAllowed(state) && !(await hasOpenSupportTicket(user.email));
    }

    return NextResponse.json({ show, canSnooze });
  } catch (err) {
    console.error("testimonial-ask GET failed", err);
    return NextResponse.json({ show: false });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const userId = user.id;

  let action = "";
  try {
    const body = (await request.json()) as { action?: string };
    action = body.action ?? "";
  } catch {
    // fall through to bad-request below
  }
  if (action !== "dismiss" && action !== "snooze") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const admin = createAdminClient() as unknown as AskAdmin | null;
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let stamp: Date;
  if (action === "snooze") {
    stamp = new Date(Date.now() + SNOOZE_DAYS * DAY_MS);
    stamp.setUTCMilliseconds(777);
  } else {
    stamp = new Date();
    if (isSnoozeStamp(stamp)) stamp.setUTCMilliseconds(778);
  }

  try {
    // A snooze means the user saw the ask and deferred it: count it toward the cap.
    if (action === "snooze") await recordAsk(admin, userId, await readAskState(admin, userId));
    await admin
      .from("subscriptions")
      .update({ testimonial_banner_dismissed_at: stamp.toISOString() })
      .eq("user_id", userId);
  } catch (err) {
    console.error("testimonial-ask dismiss failed", err);
  }
  return NextResponse.json({ ok: true });
}
