/**
 * GET /api/admin/testimonials/list?status=pending|approved|rejected|hidden|all
 *
 * Returns the moderation config plus the testimonials for the requested status
 * filter. Gated by the testimonials.moderate permission.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import {
  listAdminTestimonials,
  readTestimonialsConfig,
  type TestimonialStatus,
} from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: TestimonialStatus[] = ["pending", "approved", "rejected", "hidden"];

export async function GET(request: Request) {
  const actor = await requirePermission("testimonials.moderate", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("status") ?? "all";
  const status: TestimonialStatus | "all" =
    raw === "all" || STATUSES.includes(raw as TestimonialStatus)
      ? (raw as TestimonialStatus | "all")
      : "all";

  const [config, testimonials] = await Promise.all([
    readTestimonialsConfig(),
    listAdminTestimonials(status),
  ]);

  return NextResponse.json({ admin: { email: actor.email }, config, testimonials });
}
