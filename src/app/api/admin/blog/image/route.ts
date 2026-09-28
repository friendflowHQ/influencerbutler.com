/**
 * POST /api/admin/blog/image  - commit a hero PNG to the repo at
 *   public/assets/blog/<id>.png. Used after AI generation ("Use this image")
 *   and for upload-your-own. Validates PNG magic bytes and caps at 8MB.
 *   The image is served publicly once the triggered Vercel deploy lands.
 *
 * Permission: blog.manage. Env: GITHUB_CONTENT_TOKEN/REPO.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { commitFiles, githubContentConfigured } from "@/lib/github-content";
import { SLUG_RE } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!githubContentConfigured()) {
    return NextResponse.json(
      { error: "GITHUB_CONTENT_TOKEN / GITHUB_CONTENT_REPO not configured" },
      { status: 500 },
    );
  }

  let payload: { id?: unknown; b64?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String(payload.id ?? "").trim();
  if (!SLUG_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const b64 = typeof payload.b64 === "string" ? payload.b64 : "";
  if (!b64) return NextResponse.json({ error: "b64 image data is required" }, { status: 400 });

  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    return NextResponse.json({ error: "b64 is not valid base64" }, { status: 400 });
  }
  if (!bytes.length || !bytes.subarray(0, 4).equals(PNG_MAGIC)) {
    return NextResponse.json({ error: "Image must be a PNG" }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (8MB max)" }, { status: 400 });
  }

  try {
    const { commitSha } = await commitFiles({
      message: `blog(admin): hero image for ${id}\n\nBy ${actor.email} via admin dashboard`,
      changes: [{ path: `public/assets/blog/${id}.png`, contentBase64: b64 }],
    });

    await logAdminAction({
      actor,
      action: "blog.image.commit",
      targetType: "blog_post",
      targetId: id,
      details: { bytes: bytes.length, commitSha },
    });

    return NextResponse.json({ commitSha, image: `/assets/blog/${id}.png` });
  } catch (error) {
    return NextResponse.json(
      { error: `Image commit failed: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}
