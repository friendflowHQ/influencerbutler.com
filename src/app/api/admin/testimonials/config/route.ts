/**
 * POST /api/admin/testimonials/config
 * Body: { enabled, autoApprove, autoApproveMinRating, publicMaxCount }
 *
 * Saves the testimonials moderation config (auto-approve on/off, the star
 * threshold that auto-publishes, public feed size, feed on/off). Gated by
 * testimonials.moderate; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  readTestimonialsConfig,
  writeTestimonialsConfig,
  type TestimonialsConfig,
} from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  enabled?: boolean;
  autoApprove?: boolean;
  autoApproveMinRating?: number;
  publicMaxCount?: number;
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

  const minRating = Number(body.autoApproveMinRating);
  const maxCount = Number(body.publicMaxCount);

  const next: TestimonialsConfig = {
    enabled: body.enabled !== false,
    autoApprove: body.autoApprove !== false,
    autoApproveMinRating:
      Number.isFinite(minRating) && minRating >= 1 && minRating <= 5 ? Math.round(minRating) : 4,
    publicMaxCount:
      Number.isFinite(maxCount) && maxCount > 0 ? Math.min(Math.round(maxCount), 50) : 12,
  };

  const ok = await writeTestimonialsConfig(next, actor.email);
  if (!ok) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  await logAdminAction({
    actor,
    action: "testimonial.config",
    targetType: "config",
    targetId: "testimonials",
    details: { ...next },
  });

  const config = await readTestimonialsConfig();
  return NextResponse.json({ ok: true, config });
}
