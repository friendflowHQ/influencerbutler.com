/**
 * POST /api/testimonials/submit
 * Body: { rating, body, authorName, authorRole?, photoUrl? }
 *
 * Authenticated customer submission. Verifies a real session, confirms the
 * caller is (or was) a subscriber, resolves their plan + profile avatar
 * server-side (subscriptions is RLS-locked, so we read it via the service-role
 * client), then records the testimonial. High ratings auto-publish per the
 * moderation config; the rest are held for the team. Also stamps
 * subscriptions.testimonial_submitted_at so we stop asking this user.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";
import { submitTestimonial } from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmitBody = {
  rating?: number;
  body?: string;
  authorName?: string;
  authorRole?: string | null;
  photoUrl?: string | null;
  source?: string;
};

const BODY_MIN = 10;
const BODY_MAX = 1200;
const NAME_MAX = 80;
const ROLE_MAX = 80;

// Looser view of the service-role client than admin.ts exposes: we need
// .eq().order() and .eq().maybeSingle() chains it doesn't declare.
type SubmitAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
  };
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Pick a rating from 1 to 5 stars." }, { status: 400 });
  }

  const quote = typeof body.body === "string" ? body.body.trim() : "";
  if (quote.length < BODY_MIN) {
    return NextResponse.json({ error: "Tell us a little more (at least a sentence)." }, { status: 400 });
  }
  if (quote.length > BODY_MAX) {
    return NextResponse.json({ error: "That's a bit long, please trim it down." }, { status: 400 });
  }

  const authorName =
    typeof body.authorName === "string" && body.authorName.trim()
      ? body.authorName.trim().slice(0, NAME_MAX)
      : null;
  if (!authorName) {
    return NextResponse.json({ error: "Add the name to show with your review." }, { status: 400 });
  }
  const authorRole =
    typeof body.authorRole === "string" && body.authorRole.trim()
      ? body.authorRole.trim().slice(0, ROLE_MAX)
      : null;

  // Only accept a photo URL that lives in our own testimonials bucket.
  const photoUrl =
    typeof body.photoUrl === "string" && /\/storage\/v1\/object\/public\/testimonials\//.test(body.photoUrl)
      ? body.photoUrl
      : null;

  // Resolve plan + profile server-side. subscriptions is RLS-locked (no SELECT
  // policy), so this must go through the service-role client.
  const admin = createAdminClient() as unknown as SubmitAdmin | null;
  let planName: string | null = null;
  let isSubscriber = false;
  let avatarUrl: string | null = null;

  if (admin) {
    try {
      const { data: subs } = await admin
        .from("subscriptions")
        .select("plan_name,status,created_at")
        .eq("user_id", user.id)
        // most recent subscription row wins for plan labelling
        .order("created_at", { ascending: false });
      const rows = (subs as Array<{ plan_name?: string | null }> | null) ?? [];
      if (rows.length > 0) {
        isSubscriber = true;
        planName = rows[0].plan_name ?? null;
      }
    } catch (err) {
      console.error("testimonial submit: subscription lookup failed", err);
    }

    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      avatarUrl = (profile?.avatar_url as string | null) ?? null;
    } catch {
      // avatar is optional
    }
  }

  if (!isSubscriber) {
    return NextResponse.json(
      { error: "Testimonials are open to Influencer Butler subscribers." },
      { status: 403 },
    );
  }

  const result = await submitTestimonial({
    userId: user.id,
    email: user.email ?? null,
    authorName,
    authorRole,
    planName,
    rating,
    body: quote,
    photoUrl,
    avatarUrl,
    consent: true,
    source: body.source === "email" ? "email" : "in_app",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Stamp submitted_at so the ask banner + cron stop targeting this user.
  if (admin) {
    try {
      await admin
        .from("subscriptions")
        .update({ testimonial_submitted_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } catch (err) {
      console.error("testimonial submit: stamp failed", err);
    }
  }

  return NextResponse.json({ ok: true, published: result.status === "approved" });
}
