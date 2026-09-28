/**
 * POST /api/grow-together/upload  (multipart/form-data: email, token, file)
 *
 * Uploads a contributor's headshot/logo to Supabase Storage and returns its public
 * URL, which the submission form then stores on the row. Authorized by the same
 * signed submit token as the submission itself (no login).
 *
 * Storage: the public bucket `bundle-headshots` (create it once in Supabase). If
 * the bucket is missing or Storage errors, this returns a clear error and the form
 * falls back to its paste-a-link field, so a missing bucket never blocks a
 * submission.
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBundleSubmitToken } from "@/lib/grow-together-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUCKET = "bundle-headshots";
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("token") ?? "");
  if (!email || !EMAIL_RE.test(email) || !token || !verifyBundleSubmitToken(email, token)) {
    return NextResponse.json({ error: "This upload link is not valid." }, { status: 403 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please choose an image." }, { status: 400 });
  }
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Please upload a JPG, PNG, WEBP, or GIF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large (max 6 MB)." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Path is keyed by a hash of the email (so it is stable-ish per person and does
  // not leak the address) plus a random suffix so revisions do not collide.
  const who = crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
  const path = `${who}/${crypto.randomUUID()}.${ext}`;

  try {
    const db = createAdminClient();
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });
    if (error) {
      console.error("grow-together upload: storage upload failed", error);
      return NextResponse.json(
        { error: "We could not save that image. You can paste an image link instead." },
        { status: 502 },
      );
    }
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (err) {
    console.error("grow-together upload: threw", err);
    return NextResponse.json(
      { error: "We could not save that image. You can paste an image link instead." },
      { status: 500 },
    );
  }
}
