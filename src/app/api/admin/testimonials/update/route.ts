/**
 * POST /api/admin/testimonials/update
 * Body (discriminated by `action`):
 *   { action: "status",  id, status: "approved"|"rejected"|"hidden"|"pending" }
 *   { action: "respond", id, response: string | null }
 *   { action: "feature", id, featured: boolean }
 *   { action: "edit",    id, authorName?, authorRole?, body? }
 *
 * Single moderation mutation endpoint for the testimonials dashboard. Gated by
 * testimonials.moderate; every change is audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  setTestimonialStatus,
  setTestimonialResponse,
  setTestimonialFeatured,
  updateTestimonial,
  type TestimonialStatus,
} from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const VALID_STATUS: TestimonialStatus[] = ["approved", "rejected", "hidden", "pending"];

type Body = {
  action?: string;
  id?: string;
  status?: string;
  response?: string | null;
  featured?: boolean;
  authorName?: string;
  authorRole?: string | null;
  body?: string;
};

export async function POST(request: Request) {
  const actor = await requirePermission("testimonials.moderate", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  let ok = false;
  const details: Record<string, unknown> = { action: body.action };

  switch (body.action) {
    case "status": {
      const status = VALID_STATUS.includes(body.status as TestimonialStatus)
        ? (body.status as TestimonialStatus)
        : null;
      if (!status) return NextResponse.json({ error: "Bad status" }, { status: 400 });
      ok = await setTestimonialStatus(id, status);
      details.status = status;
      break;
    }
    case "respond": {
      const response = typeof body.response === "string" ? body.response : null;
      ok = await setTestimonialResponse(id, response, actor.email);
      details.hasResponse = !!response?.trim();
      break;
    }
    case "feature": {
      const featured = body.featured === true;
      ok = await setTestimonialFeatured(id, featured);
      details.featured = featured;
      break;
    }
    case "edit": {
      ok = await updateTestimonial(id, {
        authorName: typeof body.authorName === "string" ? body.authorName : undefined,
        authorRole: body.authorRole,
        body: typeof body.body === "string" ? body.body : undefined,
      });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!ok) return NextResponse.json({ error: "Could not update" }, { status: 500 });

  await logAdminAction({
    actor,
    action: `testimonial.${body.action}`,
    targetType: "testimonial",
    targetId: id,
    details,
  });

  return NextResponse.json({ ok: true });
}
