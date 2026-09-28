/**
 * POST /api/admin/blog/image/generate  - generate a branded hero image for a
 *   post from its imagePrompt via OpenAI gpt-image-1. Returns the PNG as
 *   base64 for client-side preview; nothing is committed until the admin
 *   clicks "Use this image" (POST /api/admin/blog/image).
 *
 * Mirrors scripts/generate-blog-images.mjs exactly: same STYLE_SUFFIX brand
 * prompt, 1536x1024, quality medium. Needs OPENAI_API_KEY (already used by
 * ai-notes / the concierge). Generation takes 30-90s, hence maxDuration 300
 * (same ceiling the cron routes use).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { generateHeroImage } from "@/lib/blog-hero";
import { SLUG_RE } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let payload: { id?: unknown; imagePrompt?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String(payload.id ?? "").trim();
  if (!SLUG_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const imagePrompt = String(payload.imagePrompt ?? "").trim().slice(0, 1000);
  if (!imagePrompt) return NextResponse.json({ error: "imagePrompt is required" }, { status: 400 });

  try {
    const b64 = await generateHeroImage(imagePrompt);

    await logAdminAction({
      actor,
      action: "blog.image.generate",
      targetType: "blog_post",
      targetId: id,
    });

    return NextResponse.json({ b64 });
  } catch (error) {
    return NextResponse.json(
      { error: `Image generation failed: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}
