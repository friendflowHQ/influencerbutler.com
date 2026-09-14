/**
 * POST /api/extension/social-posts/upload  (multipart/form-data: file)
 *
 * Image-bytes fallback for the "click an image, schedule a post" flow. The
 * default path only stores a remote image_url the desktop downloads server-side,
 * but some hosts (e.g. Instagram's CDN) block server hotlinking. When that
 * happens the extension uploads the bytes here and the resulting public URL /
 * path is stored on the scheduled post as image_source 'upload'.
 *
 * Auth: Bearer license key (same credential as the create route). Storage: the
 * public bucket `social-post-images` (create it once in Supabase, like
 * `bundle-headshots`). Modeled on /api/grow-together/upload.
 */
import crypto from "node:crypto";
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "social-post-images";
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonWithCors({ error: "Invalid upload." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonWithCors({ error: "Please choose an image." }, 400);
  }
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return jsonWithCors({ error: "Please upload a JPG, PNG, WEBP, or GIF." }, 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonWithCors({ error: "That image is too large (max 12 MB)." }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Path keyed by the owning user id plus a random suffix so revisions never
  // collide and one creator's uploads stay grouped.
  const path = `${auth.auth.userId}/${crypto.randomUUID()}.${ext}`;

  try {
    const db = createAdminClient();
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });
    if (error) {
      console.error("social-posts upload: storage upload failed", error);
      return jsonWithCors({ error: "We could not save that image." }, 502);
    }
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return jsonWithCors({ ok: true, path, url: data.publicUrl });
  } catch (err) {
    console.error("social-posts upload: threw", err);
    return jsonWithCors({ error: "We could not save that image." }, 500);
  }
}
