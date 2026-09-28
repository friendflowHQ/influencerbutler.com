/**
 * POST /api/admin/events/youtube-upload
 * Body: { id, videoUrl?, loomUrl?, title?, description?, privacy? }
 *
 * Manually publish an event recording to YouTube from an arbitrary source URL,
 * with the event's branded cover as the thumbnail and a custom (SEO) description.
 * This is the on-demand counterpart to the youtube-uploads cron: the cron only
 * handles recordings Recall captured (events.recording_url), but a call can also
 * be recorded elsewhere (e.g. Loom or Google Meet), and this lets the owner push
 * that recording up without a Recall bot ever having run.
 *
 * Source: pass `videoUrl` (any fetchable video URL, e.g. a signed Loom CDN MP4)
 * or `loomUrl` (a loom.com/share link, resolved to its MP4 here so the signed URL
 * is minted fresh at upload time). Reuses the same Google OAuth connection and
 * uploadVideoFromUrl streaming as the cron, so no file is buffered. On success the
 * event's youtube_* fields are stored exactly as the cron would. Gated by
 * events.manage; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import { loadConfig } from "@/lib/scheduling-server";
import { uploadVideoFromUrl, type YouTubePrivacy } from "@/lib/youtube";
import { resolveLoomMp4Url, isLoomCdnUrl } from "@/lib/loom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A single streamed upload of an hour-long recording can take minutes.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f-]{36}$/i;

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

type Body = {
  id?: string;
  videoUrl?: string;
  loomUrl?: string;
  title?: string;
  description?: string;
  privacy?: string;
};

/** Public YouTube description: the admin's SEO copy (or the event blurb) plus
 *  attribution and the event-page link. Never transcript or registrant data. */
function buildDescription(base: string, eventId: string): string {
  return [base, "Recorded live with Influencer Butler.", `${SITE}/events/${eventId}`]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const privacy = (["public", "unlisted", "private"] as const).includes(body.privacy as YouTubePrivacy)
    ? (body.privacy as YouTubePrivacy)
    : "public";

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve the source video URL. A loom.com share link is resolved to its signed
  // MP4 here (fresh), so the time-limited URL is minted right before the upload; a
  // direct videoUrl (including an already-signed Loom CDN URL) is used as-is.
  let videoUrl = (body.videoUrl || "").trim();
  const loomUrl = (body.loomUrl || "").trim();
  if (!videoUrl && loomUrl) {
    const resolved = await resolveLoomMp4Url(loomUrl);
    if (!resolved) {
      return NextResponse.json(
        { error: "Could not resolve the Loom link to a downloadable MP4. Paste the direct video URL instead." },
        { status: 400 },
      );
    }
    videoUrl = resolved;
  } else if (videoUrl && !isLoomCdnUrl(videoUrl) && /loom\.com\/(share|embed)\//i.test(videoUrl)) {
    // A loom share link landed in videoUrl by mistake; resolve it rather than fail.
    const resolved = await resolveLoomMp4Url(videoUrl);
    if (resolved) videoUrl = resolved;
  }
  if (!videoUrl) {
    return NextResponse.json({ error: "Provide videoUrl or loomUrl." }, { status: 400 });
  }

  const cfg = await loadConfig(admin);
  if (!cfg.googleRefreshToken) {
    return NextResponse.json(
      { error: "Google is not connected (no refresh token). Connect Google in Scheduling first." },
      { status: 400 },
    );
  }

  // Mark uploading so the admin card reflects the in-flight state and the cron
  // will not also pick this event up.
  await admin
    .from("events")
    .update({ youtube_status: "uploading", youtube_error: null })
    .eq("id", id);

  const title = (body.title || "").trim() || event.title;
  const description = buildDescription((body.description || "").trim() || event.description || "", id);

  const res = await uploadVideoFromUrl({
    refreshToken: cfg.googleRefreshToken,
    videoUrl,
    title,
    description,
    privacyStatus: privacy,
    expectedChannel: process.env.YOUTUBE_TARGET_CHANNEL || null,
    thumbnailUrl: event.imageUrl, // the event's branded cover
  });

  if (!res.ok) {
    await admin
      .from("events")
      .update({ youtube_status: "failed", youtube_error: res.error })
      .eq("id", id);
    await logAdminAction({
      actor,
      action: "event.youtube_upload",
      targetType: "event",
      targetId: id,
      details: { ok: false, error: res.error },
    });
    return NextResponse.json({ error: res.error, channel: res.channel ?? null }, { status: 502 });
  }

  await admin
    .from("events")
    .update({
      youtube_status: "uploaded",
      youtube_video_id: res.videoId,
      youtube_url: res.url,
      youtube_error: null,
      youtube_uploaded_at: new Date().toISOString(),
    })
    .eq("id", id);

  await logAdminAction({
    actor,
    action: "event.youtube_upload",
    targetType: "event",
    targetId: id,
    details: { ok: true, url: res.url, thumbnailSet: res.thumbnailSet, privacy },
  });

  return NextResponse.json({
    ok: true,
    url: res.url,
    videoId: res.videoId,
    channel: res.channel,
    thumbnailSet: res.thumbnailSet,
  });
}
