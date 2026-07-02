/**
 * GET /api/testimonials/mine
 *
 * The signed-in user's most recent testimonial with its moderation status and
 * any team reply, so the feedback page can close the loop after submission.
 * Returns { testimonial: null } for users who have not submitted (or when the
 * testimonials table is not migrated yet - getMyTestimonial swallows errors).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyTestimonial } from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const testimonial = await getMyTestimonial(data.user.id);
  return NextResponse.json({ testimonial });
}
