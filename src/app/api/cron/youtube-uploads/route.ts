/**
 * GET /api/cron/youtube-uploads  (hourly, CRON_SECRET-guarded, ?dry=1 to preview)
 * Streams finished event recordings to the owner's YouTube channel (Public).
 *
 * Decoupled from the recording finalize on purpose: uploading an hour-long video
 * is far too slow to run inside the Recall webhook or the recap step, so
 * event-recording-finalize.ts only marks youtube_status='pending' and this cron
 * does the actual upload. One recording per run (uploads are the long pole),
 * with a status-guarded lock ('pending' -> 'uploading') so two overlapping runs
 * can never upload the same video twice. Best-effort: a failure is recorded as
 * youtube_status='failed' with the reason, and the admin can re-queue it.
 *
 * maxDuration is raised because a single streamed upload can take minutes; a
 * recording longer than the function limit will fail and can be retried.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/events";
import { loadConfig } from "@/lib/scheduling-server";
import { uploadVideoFromUrl } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[youtube-uploads] CRON_SECRET not set");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type Row = {
  id: string;
  title: string;
  description: string | null;
  recording_url: string | null;
  image_url: string | null;
};

// Optional guard: when set (a channel id or @handle), the upload is refused
// unless the connected Google token is bound to this channel, so a multi-channel
// account can never publish to the wrong one. Unset = no channel check.
const TARGET_CHANNEL = process.env.YOUTUBE_TARGET_CHANNEL || null;

/** Public YouTube description: event blurb + attribution + link. Never the
 *  transcript or any registrant data, since the video is Public. */
function buildDescription(row: Row): string {
  return [row.description || "", "Recorded live with Influencer Butler.", `${SITE}/events/${row.id}`]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Oldest waiting recording that actually has a video to push.
  const { data, error } = await admin
    .from("events")
    .select("id,title,description,recording_url,image_url")
    .eq("youtube_status", "pending")
    .not("recording_url", "is", null)
    .order("recorded_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[youtube-uploads] query", error.message);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
  const row = (data ?? [])[0] as Row | undefined;
  if (!row) return NextResponse.json({ ok: true, processed: 0 });
  if (dry) return NextResponse.json({ ok: true, dry: true, candidate: { id: row.id, title: row.title } });

  // Claim it: only proceed if this update actually flips it out of 'pending', so
  // a concurrent run cannot pick up the same row.
  const { data: claimed } = await admin
    .from("events")
    .update({ youtube_status: "uploading", youtube_error: null })
    .eq("id", row.id)
    .eq("youtube_status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, note: "already claimed" });
  }

  const cfg = await loadConfig(admin);
  if (!cfg.googleRefreshToken) {
    await admin
      .from("events")
      .update({ youtube_status: "failed", youtube_error: "Google not connected (no refresh token)" })
      .eq("id", row.id);
    return NextResponse.json({ ok: false, id: row.id, error: "google-not-connected" });
  }

  const res = await uploadVideoFromUrl({
    refreshToken: cfg.googleRefreshToken,
    videoUrl: row.recording_url as string,
    title: row.title,
    description: buildDescription(row),
    privacyStatus: "public",
    expectedChannel: TARGET_CHANNEL,
    thumbnailUrl: row.image_url,
  });

  if (res.ok) {
    await admin
      .from("events")
      .update({
        youtube_status: "uploaded",
        youtube_video_id: res.videoId,
        youtube_url: res.url,
        youtube_error: null,
        youtube_uploaded_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return NextResponse.json({
      ok: true,
      id: row.id,
      url: res.url,
      channel: res.channel,
      thumbnailSet: res.thumbnailSet,
    });
  }

  await admin
    .from("events")
    .update({ youtube_status: "failed", youtube_error: res.error })
    .eq("id", row.id);
  console.error("[youtube-uploads] upload failed", row.id, res.error);
  return NextResponse.json({ ok: false, id: row.id, error: res.error });
}
