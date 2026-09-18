/**
 * YouTube upload for finished event recordings. Reuses the same Google OAuth
 * client the Meet integration uses (google-meet.ts): the owner connects Google
 * once, and the stored refresh token (call_config.google_refresh_token) carries
 * the youtube.upload scope once she reconnects after that scope was added.
 *
 * Zero SDK: hand-rolled fetch against the YouTube Data API v3 resumable-upload
 * endpoint, mirroring google-meet.ts / google-calendar.ts. The video bytes are
 * streamed straight from Recall's recording URL into the YouTube PUT (a
 * pass-through body), so an hour-long recording never has to be buffered in the
 * function's memory.
 *
 * Prereqs (one-time, owner): enable "YouTube Data API v3" on the Google Cloud
 * project behind GOOGLE_OAUTH_CLIENT_ID, then reconnect Google in the Scheduling
 * admin so the youtube.upload scope is granted.
 */
import { accessTokenFrom, isGoogleConfigured } from "@/lib/google-meet";

export type YouTubePrivacy = "public" | "unlisted" | "private";

export type YouTubeChannel = { id: string; title: string; handle: string | null };

export type YouTubeUploadResult =
  | { ok: true; videoId: string; url: string; channel: YouTubeChannel | null; thumbnailSet: boolean }
  | { ok: false; error: string; channel?: YouTubeChannel | null };

/** Normalizes a channel id or handle for comparison: lowercased, no leading @. */
function normChannel(s: string): string {
  return s.trim().toLowerCase().replace(/^@/, "");
}

/** True when the bound channel matches the expected id or handle. */
function channelMatches(ch: YouTubeChannel, expected: string): boolean {
  const want = normChannel(expected);
  return (
    normChannel(ch.id) === want ||
    (ch.handle ? normChannel(ch.handle) === want : false) ||
    normChannel(ch.title) === want
  );
}

/**
 * Which YouTube channel the given refresh token uploads to. For a Google account
 * with several channels (brand accounts), the OAuth token is bound to exactly
 * one, and mine=true returns it. Used to verify the connection targets the right
 * channel before (and after) an upload. Returns null on any failure.
 */
export async function getBoundChannel(refreshToken: string): Promise<YouTubeChannel | null> {
  const accessToken = await accessTokenFrom(refreshToken);
  if (!accessToken) return null;
  return getBoundChannelWithToken(accessToken);
}

async function getBoundChannelWithToken(accessToken: string): Promise<YouTubeChannel | null> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: { id?: string; snippet?: { title?: string; customUrl?: string } }[];
    };
    const it = json.items?.[0];
    if (!it?.id) return null;
    return {
      id: it.id,
      title: it.snippet?.title ?? "",
      handle: it.snippet?.customUrl ?? null,
    };
  } catch {
    return null;
  }
}

/** Best-effort custom thumbnail. Needs a verified channel; a failure (unverified
 *  channel, unfetchable image) is swallowed so it never fails the upload. */
async function setThumbnail(accessToken: string, videoId: string, imageUrl: string): Promise<boolean> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return false;
    const ct = (imgRes.headers.get("content-type") || "image/png").split(";")[0].trim();
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    const put = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": ct }, body: bytes },
    );
    return put.ok;
  } catch {
    return false;
  }
}

/** YouTube caps: title 100 chars, description 5000 chars. Trim defensively. */
function clampTitle(s: string): string {
  const t = s.trim() || "Live event recording";
  return t.length > 100 ? `${t.slice(0, 97)}...` : t;
}
function clampDescription(s: string): string {
  return s.length > 4900 ? `${s.slice(0, 4900)}...` : s;
}

/**
 * Stream a video from `videoUrl` (a Recall download URL) to YouTube and return
 * the new video's id + watch URL. Never throws: every failure returns
 * { ok:false, error } so the caller can record it and move on. `categoryId` 27
 * is "Education"; kids-directed is declared false (COPPA) since these are
 * business webinars.
 */
export async function uploadVideoFromUrl(args: {
  refreshToken: string;
  videoUrl: string;
  title: string;
  description: string;
  privacyStatus?: YouTubePrivacy;
  /** If set (channel id or @handle), the upload is refused unless the connected
   *  token is bound to this channel, so it can never land on the wrong one. */
  expectedChannel?: string | null;
  /** Public image URL to set as the video thumbnail (best-effort). */
  thumbnailUrl?: string | null;
}): Promise<YouTubeUploadResult> {
  if (!isGoogleConfigured()) return { ok: false, error: "Google OAuth not configured" };
  if (!args.refreshToken) return { ok: false, error: "No Google refresh token; connect Google in Scheduling" };
  if (!args.videoUrl) return { ok: false, error: "No recording URL to upload" };

  const accessToken = await accessTokenFrom(args.refreshToken);
  if (!accessToken) {
    return { ok: false, error: "Could not mint a Google access token (refresh token invalid or scope missing)" };
  }

  // Resolve which channel this token uploads to, and refuse if it is not the
  // expected one (the account may have several channels / brand accounts).
  const channel = await getBoundChannelWithToken(accessToken);
  if (args.expectedChannel) {
    if (!channel) {
      return { ok: false, error: "Could not read the connected YouTube channel to verify it.", channel: null };
    }
    if (!channelMatches(channel, args.expectedChannel)) {
      return {
        ok: false,
        channel,
        error: `Connected to "${channel.title}" (${channel.handle ?? channel.id}), not ${args.expectedChannel}. Reconnect Google in Scheduling and pick the right channel.`,
      };
    }
  }

  // Open the source stream from Recall first so we can forward its Content-Length
  // to YouTube (the resumable protocol wants the byte count up front).
  let videoRes: Response;
  try {
    videoRes = await fetch(args.videoUrl);
  } catch (e) {
    return { ok: false, error: `Fetch recording failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!videoRes.ok || !videoRes.body) {
    return { ok: false, error: `Recording URL returned HTTP ${videoRes.status}` };
  }
  const contentLength = videoRes.headers.get("content-length");
  // YouTube's resumable upload only accepts a video/* media type. Recall serves
  // the recording as binary/octet-stream (or application/octet-stream), which
  // YouTube rejects with 400 "Media type not supported", so fall back to
  // video/mp4 (Recall's recordings are mp4) unless the source already declares a
  // real video type.
  const rawType = (videoRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentType = rawType.startsWith("video/") ? rawType : "video/mp4";

  // 1) Initiate the resumable session. Metadata goes as JSON; YouTube replies
  //    with the upload URL in the Location header.
  let initRes: Response;
  try {
    initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          ...(contentLength ? { "X-Upload-Content-Length": contentLength } : {}),
        },
        body: JSON.stringify({
          snippet: {
            title: clampTitle(args.title),
            description: clampDescription(args.description),
            categoryId: "27",
          },
          status: {
            privacyStatus: args.privacyStatus ?? "public",
            selfDeclaredMadeForKids: false,
            embeddable: true,
          },
        }),
      },
    );
  } catch (e) {
    return { ok: false, error: `Init upload failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!initRes.ok) {
    const body = await initRes.text().catch(() => "");
    return { ok: false, error: `YouTube init HTTP ${initRes.status}: ${body.slice(0, 300)}` };
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) return { ok: false, error: "YouTube did not return a resumable upload URL" };

  // 2) Stream the bytes. Passing another response's body as the request body
  //    requires the half-duplex flag on Node's undici fetch.
  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      },
      body: videoRes.body,
      // @ts-expect-error - duplex is required by Node fetch for a streamed body but missing from the DOM types.
      duplex: "half",
    });
  } catch (e) {
    return { ok: false, error: `Upload stream failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    return { ok: false, error: `YouTube upload HTTP ${putRes.status}: ${body.slice(0, 300)}` };
  }

  let videoId: string | null = null;
  try {
    videoId = ((await putRes.json()) as { id?: string }).id ?? null;
  } catch {
    /* fall through to the missing-id error */
  }
  if (!videoId) return { ok: false, error: "Upload completed but YouTube returned no video id", channel };

  // Best-effort custom thumbnail from the event cover image.
  let thumbnailSet = false;
  if (args.thumbnailUrl) {
    thumbnailSet = await setThumbnail(accessToken, videoId, args.thumbnailUrl);
  }

  return { ok: true, videoId, url: `https://www.youtube.com/watch?v=${videoId}`, channel, thumbnailSet };
}
